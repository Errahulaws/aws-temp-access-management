import { prisma } from '../utils/prisma';
import { IamPolicyService } from './iam-policy.service';
import { AuditService } from './audit.service';
import { logger } from '../utils/logger';

export class ExpirationService {
  /**
   * Finds all ACTIVE requests past their expiresAt time,
   * marks them EXPIRED, and removes their statements from IAM policies.
   */
  static async processExpiredRequests(): Promise<{ expired: number; policyCleaned: number }> {
    const now = new Date();

    const BATCH_SIZE = 50;

    const expiredRequests = await prisma.accessRequest.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
      },
      include: {
        requester: { select: { id: true, email: true } },
      },
      take: BATCH_SIZE,
      orderBy: { expiresAt: 'asc' },
    });

    if (expiredRequests.length === 0) {
      return { expired: 0, policyCleaned: 0 };
    }

    let policyCleaned = 0;

    for (const request of expiredRequests) {
      await prisma.accessRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
      });

      if (request.team && request.policyStatementId && request.targetAccountId) {
        try {
          await this.removeStatementFromPolicy(request.team, request.policyStatementId, request.targetAccountId);
          policyCleaned++;
          logger.info(`Removed expired statement ${request.policyStatementId} from team ${request.team} policy`, {
            targetAccount: request.targetAccountId,
          });
        } catch (error) {
          logger.error(`Failed to remove expired statement from policy`, {
            requestId: request.id,
            team: request.team,
            statementId: request.policyStatementId,
            targetAccount: request.targetAccountId,
            error,
          });
        }
      }

      await AuditService.log({
        eventType: 'REQUEST_EXPIRED',
        requestId: request.id,
        actorId: request.requesterId,
        actorRole: 'REQUESTER',
        eventData: {
          policyStatementId: request.policyStatementId,
          expiredAt: now.toISOString(),
        },
      });
    }

    return { expired: expiredRequests.length, policyCleaned };
  }

  private static async removeStatementFromPolicy(
    teamId: string,
    statementId: string,
    targetAccountId: string,
  ): Promise<void> {
    const currentPolicy = await IamPolicyService.getCurrentPolicy(teamId, targetAccountId);

    const filteredStatements = currentPolicy.Statement.filter(
      (s) => s.Sid !== statementId,
    );

    if (filteredStatements.length === currentPolicy.Statement.length) {
      logger.warn(`Statement ${statementId} not found in policy for team ${teamId}`, {
        targetAccount: targetAccountId,
      });
      return;
    }

    const cleanedPolicy = {
      ...currentPolicy,
      Statement: filteredStatements,
    };

    await IamPolicyService.applyPolicy(teamId, cleanedPolicy, targetAccountId);
  }
}
