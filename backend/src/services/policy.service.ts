import { logger } from '../utils/logger';
import { buildAwsUserId } from '../config/teams';

interface PolicyStatement {
  Sid: string;
  Effect: 'Allow';
  Action: string[];
  Resource: string[];
  Condition: {
    StringEquals?: { 'aws:userid': string[] };
    DateGreaterThan: { 'aws:CurrentTime': string };
    DateLessThan: { 'aws:CurrentTime': string };
  };
}

interface PolicyDocument {
  Version: '2012-10-17';
  Statement: PolicyStatement[];
}

interface GrantInput {
  requestId: string;
  secretArns: string[];
  actions: string[];
  environment: string;
  durationHours: number;
  activatedAt: Date;
  email: string;
  roleLevel?: string;
  targetAccountId?: string;
}

export class PolicyService {
  static generateStatement(input: GrantInput): PolicyStatement {
    const expiresAt = new Date(input.activatedAt.getTime() + input.durationHours * 60 * 60 * 1000);

    const condition: PolicyStatement['Condition'] = {
      DateGreaterThan: {
        'aws:CurrentTime': input.activatedAt.toISOString(),
      },
      DateLessThan: {
        'aws:CurrentTime': expiresAt.toISOString(),
      },
    };

    if (input.roleLevel && input.targetAccountId) {
      const awsUserId = buildAwsUserId(input.roleLevel, input.email, input.targetAccountId);
      if (!awsUserId) {
        throw new Error(
          `Cannot generate policy: failed to resolve aws:userid for role '${input.roleLevel}' in account ${input.targetAccountId}. Check ROLE_ID configuration.`,
        );
      }
      condition.StringEquals = { 'aws:userid': [awsUserId] };
    } else {
      throw new Error(
        'Cannot generate policy: roleLevel and targetAccountId are required for principal binding.',
      );
    }

    return {
      Sid: `IAMREQ${input.requestId.replace(/-/g, '')}${input.environment.replace(/[^a-zA-Z0-9]/g, '')}`,
      Effect: 'Allow',
      Action: input.actions,
      Resource: input.secretArns,
      Condition: condition,
    };
  }

  static generatePolicyDocument(statement: PolicyStatement): PolicyDocument {
    return {
      Version: '2012-10-17',
      Statement: [statement],
    };
  }

  static validateStatement(statement: PolicyStatement): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!statement.Sid || !/^IAMREQ[0-9A-Za-z]+$/.test(statement.Sid)) {
      errors.push('Statement Sid must start with IAMREQ and be alphanumeric');
    }

    if (statement.Effect !== 'Allow') {
      errors.push('Statement Effect must be Allow');
    }

    const allowedActions = [
      'secretsmanager:GetSecretValue',
      'secretsmanager:DescribeSecret',
      'secretsmanager:ListSecretVersionIds',
      'secretsmanager:UpdateSecret',
      'secretsmanager:PutSecretValue',
      'secretsmanager:CreateSecret',
      'secretsmanager:TagResource',
    ];
    for (const action of statement.Action) {
      if (!allowedActions.includes(action)) {
        errors.push(`Invalid action: ${action}`);
      }
      if (action.includes('*')) {
        errors.push('Wildcard actions are not permitted');
      }
    }

    const arnRegex = /^arn:aws:secretsmanager:[a-z0-9*-]+:\d{12}:secret:.+$/;
    for (const resource of statement.Resource) {
      if (resource !== '*' && !arnRegex.test(resource)) {
        errors.push(`Invalid resource ARN: ${resource}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static validatePolicySize(policy: PolicyDocument): boolean {
    const policyString = JSON.stringify(policy);
    const MAX_POLICY_SIZE = 6144;
    if (policyString.length > MAX_POLICY_SIZE) {
      logger.warn('Policy exceeds size limit', { size: policyString.length, max: MAX_POLICY_SIZE });
      return false;
    }
    return true;
  }

  static computeDiff(
    currentPolicy: PolicyDocument | null,
    newPolicy: PolicyDocument,
  ): { added: PolicyStatement[]; removed: PolicyStatement[]; unchanged: PolicyStatement[] } {
    const currentStatements = currentPolicy?.Statement ?? [];
    const newStatements = newPolicy.Statement;

    const currentSids = new Set(currentStatements.map((s) => s.Sid));
    const newSids = new Set(newStatements.map((s) => s.Sid));

    return {
      added: newStatements.filter((s) => !currentSids.has(s.Sid)),
      removed: currentStatements.filter((s) => !newSids.has(s.Sid)),
      unchanged: newStatements.filter((s) => currentSids.has(s.Sid)),
    };
  }
}
