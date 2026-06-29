import {
  IAMClient,
  GetPolicyCommand,
  GetPolicyVersionCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand,
  ListPolicyVersionsCommand,
} from '@aws-sdk/client-iam';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { getTeamConfig } from '../config/teams';
import { getAccountConfig } from '../config/accounts';
import { getExternalId } from '../utils/secrets';
import { logger } from '../utils/logger';

const stsClient = new STSClient({ region: process.env.AWS_REGION || 'us-west-2' });

const MAX_POLICY_SIZE = 6144;
const MAX_POLICY_VERSIONS = 5;
const SESSION_CACHE_TTL_MS = 50 * 60 * 1000; // 50 min (sessions last 1hr)

export interface PolicyStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
}

export interface PolicyDocument {
  Version: '2012-10-17';
  Statement: PolicyStatement[];
}

interface CachedSession {
  client: IAMClient;
  expiresAt: number;
}

const sessionCache = new Map<string, CachedSession>();

/**
 * Gets an IAMClient for a target account via STS AssumeRole.
 * External ID is fetched from Secrets Manager.
 */
async function getIamClient(accountId: string): Promise<IAMClient> {
  const now = Date.now();
  const cached = sessionCache.get(accountId);
  if (cached && now < cached.expiresAt) {
    return cached.client;
  }

  const accountConfig = getAccountConfig(accountId);
  if (!accountConfig) {
    throw new Error(`No cross-account configuration found for account: ${accountId}`);
  }

  const externalId = await getExternalId();

  const assumeResp = await stsClient.send(new AssumeRoleCommand({
    RoleArn: accountConfig.roleArn,
    RoleSessionName: `iam-access-platform-${accountId}-${Date.now()}`,
    ExternalId: externalId,
    DurationSeconds: 3600,
  }));

  const credentials = assumeResp.Credentials;
  if (!credentials?.AccessKeyId || !credentials?.SecretAccessKey || !credentials?.SessionToken) {
    throw new Error(`Failed to assume role for account ${accountId}: no credentials returned`);
  }

  const client = new IAMClient({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  });

  sessionCache.set(accountId, {
    client,
    expiresAt: now + SESSION_CACHE_TTL_MS,
  });

  logger.info(`Assumed cross-account role for account ${accountId}`, {
    roleArn: accountConfig.roleArn,
  });

  return client;
}

export class IamPolicyService {
  /**
   * Fetches the current (default) version of the managed policy document.
   * Supports cross-account access via STS AssumeRole.
   */
  static async getCurrentPolicy(teamId: string, accountId: string): Promise<PolicyDocument> {
    const team = getTeamConfig(teamId, accountId);
    if (!team) throw new Error(`Team config not found for: ${teamId} (account: ${accountId})`);

    const iam = await getIamClient(accountId);

    const policyMeta = await iam.send(new GetPolicyCommand({ PolicyArn: team.policyArn }));
    const defaultVersionId = policyMeta.Policy?.DefaultVersionId;
    if (!defaultVersionId) throw new Error(`No default version for policy: ${team.policyArn}`);

    const versionResp = await iam.send(
      new GetPolicyVersionCommand({
        PolicyArn: team.policyArn,
        VersionId: defaultVersionId,
      }),
    );

    const raw = versionResp.PolicyVersion?.Document;
    if (!raw) throw new Error(`Empty policy document for: ${team.policyArn}`);

    return JSON.parse(decodeURIComponent(raw)) as PolicyDocument;
  }

  /**
   * Computes the proposed policy by always appending a new statement.
   */
  static computeProposedPolicy(
    current: PolicyDocument,
    newStatement: PolicyStatement,
  ): PolicyDocument {
    return {
      Version: '2012-10-17',
      Statement: [...current.Statement, newStatement],
    };
  }

  /**
   * Generates a diff between current and proposed policy for display.
   */
  static generateDiff(
    current: PolicyDocument,
    proposed: PolicyDocument,
  ): { current: string; proposed: string } {
    return {
      current: JSON.stringify(current, null, 2),
      proposed: JSON.stringify(proposed, null, 2),
    };
  }

  /**
   * Applies the proposed policy as a new version and sets it as default.
   * Supports cross-account access via STS AssumeRole.
   */
  static async applyPolicy(teamId: string, proposed: PolicyDocument, accountId: string): Promise<string> {
    const team = getTeamConfig(teamId, accountId);
    if (!team) throw new Error(`Team config not found for: ${teamId} (account: ${accountId})`);

    const policyJson = JSON.stringify(proposed);
    if (policyJson.length > MAX_POLICY_SIZE) {
      throw new Error(
        `Policy exceeds maximum size (${policyJson.length}/${MAX_POLICY_SIZE} bytes)`,
      );
    }

    const iam = await getIamClient(accountId);

    await this.cleanupOldVersions(team.policyArn, iam);

    const result = await iam.send(
      new CreatePolicyVersionCommand({
        PolicyArn: team.policyArn,
        PolicyDocument: policyJson,
        SetAsDefault: true,
      }),
    );

    const versionId = result.PolicyVersion?.VersionId || 'unknown';
    logger.info(`Applied new policy version ${versionId} for team ${teamId}`, {
      policyArn: team.policyArn,
      versionId,
      size: policyJson.length,
      targetAccount: accountId || 'local',
    });

    return versionId;
  }

  /**
   * Removes the oldest non-default version if we're at the limit.
   */
  private static async cleanupOldVersions(policyArn: string, iam: IAMClient): Promise<void> {
    const versions = await iam.send(new ListPolicyVersionsCommand({ PolicyArn: policyArn }));
    const allVersions = versions.Versions || [];

    if (allVersions.length >= MAX_POLICY_VERSIONS) {
      const nonDefault = allVersions
        .filter((v: { IsDefaultVersion?: boolean }) => !v.IsDefaultVersion)
        .sort((a: { CreateDate?: Date }, b: { CreateDate?: Date }) => (a.CreateDate?.getTime() || 0) - (b.CreateDate?.getTime() || 0));

      if (nonDefault.length > 0) {
        const oldest = nonDefault[0];
        await iam.send(
          new DeletePolicyVersionCommand({
            PolicyArn: policyArn,
            VersionId: oldest.VersionId!,
          }),
        );
        logger.info(`Deleted old policy version ${oldest.VersionId} for ${policyArn}`);
      }
    }
  }

  /**
   * Validates the proposed policy size won't exceed limits.
   */
  static validatePolicySize(proposed: PolicyDocument): { valid: boolean; size: number } {
    const size = JSON.stringify(proposed).length;
    return { valid: size <= MAX_POLICY_SIZE, size };
  }
}
