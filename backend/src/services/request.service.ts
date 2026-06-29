import { prisma } from '../utils/prisma';
import { AuditService } from './audit.service';
import { PolicyService } from './policy.service';
import { IamPolicyService } from './iam-policy.service';
import { SlackService } from './slack.service';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import type { CreateRequestInput, ApproveRequestInput, RejectRequestInput, ListRequestsInput } from '../validators/request.validator';
import type { AuthUser } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getAccountConfig } from '../config/accounts';

function withAccountLabel<T extends { targetAccountId?: string | null }>(request: T): T & { accountLabel?: string } {
  if (request.targetAccountId) {
    const config = getAccountConfig(request.targetAccountId);
    return { ...request, accountLabel: config?.label?.replace(/"/g, '') || request.targetAccountId };
  }
  return { ...request, accountLabel: undefined };
}

export class RequestService {
  static async create(input: CreateRequestInput, user: AuthUser, ip?: string, userAgent?: string) {
    const existingActive = await prisma.accessRequest.findFirst({
      where: {
        requesterId: user.id,
        status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] },
        secretArns: { hasSome: input.secretArns },
        environment: input.environment,
      },
    });

    if (existingActive) {
      throw new ConflictError(
        `An active or pending request already exists for one or more of these secrets in ${input.environment}`,
      );
    }

    const accessScope = input.accessScope || 'specific';
    const approvalsRequired = accessScope === 'all' ? 2 : 1;

    const request = await prisma.accessRequest.create({
      data: {
        requesterId: user.id,
        secretArns: input.secretArns,
        actionsRequested: input.actionsRequested,
        justification: input.justification,
        environment: input.environment,
        durationHours: input.durationHours,
        team: input.team,
        roleLevel: input.roleLevel,
        accessScope,
        approvalsRequired,
        awsAccountId: input.awsAccountId,
        targetAccountId: input.targetAccountId,
        principalArn: input.principalArn,
        status: 'PENDING',
      },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await AuditService.log({
      eventType: 'REQUEST_CREATED',
      requestId: request.id,
      actorId: user.id,
      actorRole: user.role,
      eventData: {
        secretArns: input.secretArns,
        environment: input.environment,
        durationHours: input.durationHours,
        actionsRequested: input.actionsRequested,
        justification: input.justification,
        targetAccountId: input.targetAccountId,
        team: input.team,
        roleLevel: input.roleLevel,
        accessScope: input.accessScope || 'specific',
      },
      ipAddress: ip,
      userAgent,
    });

    SlackService.notifyRequestCreated({
      requestId: request.id,
      requesterName: user.name,
      requesterEmail: user.email,
      team: input.team || 'default',
      roleLevel: input.roleLevel || 'default',
      environment: input.environment,
      durationHours: input.durationHours,
      secretCount: input.secretArns.length,
      accessScope: input.accessScope || 'specific',
      targetAccountId: input.targetAccountId,
      justification: input.justification,
    }).catch(() => {});

    return withAccountLabel(request);
  }

  static async getById(id: string, user: AuthUser) {
    const request = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true, department: true } },
        approver: { select: { id: true, name: true, email: true, role: true } },
        auditLogs: {
          orderBy: { eventTime: 'asc' },
          include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
    });

    if (!request) throw new NotFoundError('Access request not found');

    if (user.role === 'REQUESTER' && request.requesterId !== user.id) {
      throw new NotFoundError('Access request not found');
    }

    return withAccountLabel(request);
  }

  static async list(params: ListRequestsInput, user: AuthUser) {
    const where: Record<string, unknown> = {};

    if (user.role === 'REQUESTER') {
      where.requesterId = user.id;
    }
    if (params.status) where.status = params.status;
    if (params.environment) where.environment = params.environment;

    const [data, total] = await Promise.all([
      prisma.accessRequest.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true, department: true } },
          approver: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.accessRequest.count({ where }),
    ]);

    return {
      data: data.map(withAccountLabel),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }

  static async policyPreview(id: string, user: AuthUser) {
    const request = await prisma.accessRequest.findUnique({
      where: { id },
      include: { requester: { select: { email: true } } },
    });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.status !== 'PENDING') {
      throw new ValidationError(`Cannot preview policy for a request in ${request.status} status`);
    }

    const now = new Date();
    const durationHours = request.durationHours;

    if (!request.targetAccountId) {
      throw new ValidationError('Cannot preview policy: no target account associated with this request');
    }

    const statement = PolicyService.generateStatement({
      requestId: request.id,
      secretArns: request.secretArns,
      actions: request.actionsRequested,
      environment: request.environment,
      durationHours,
      activatedAt: now,
      email: request.requester.email,
      roleLevel: request.roleLevel || undefined,
      targetAccountId: request.targetAccountId,
    });

    if (request.team) {
      try {
        const currentPolicy = await IamPolicyService.getCurrentPolicy(request.team, request.targetAccountId);
        const proposedPolicy = IamPolicyService.computeProposedPolicy(currentPolicy, statement);
        return IamPolicyService.generateDiff(currentPolicy, proposedPolicy);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error('Failed to generate policy preview', {
          error: errMsg,
          team: request.team,
          targetAccountId: request.targetAccountId,
          requestId: request.id,
        });
        throw new ValidationError(
          `Failed to generate policy preview for account ${request.targetAccountId}: ${errMsg}`,
        );
      }
    }

    throw new ValidationError('Cannot preview policy: no team associated with this request');
  }

  static async revokePreview(id: string, user: AuthUser) {
    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.status !== 'ACTIVE') {
      throw new ValidationError(`Cannot preview revocation for a request in ${request.status} status`);
    }

    if (!request.team || !request.policyStatementId || !request.targetAccountId) {
      throw new ValidationError('Cannot preview revocation: missing team, statement ID, or target account');
    }

    try {
      const currentPolicy = await IamPolicyService.getCurrentPolicy(request.team, request.targetAccountId);
      const filteredStatements = currentPolicy.Statement.filter(
        (s) => s.Sid !== request.policyStatementId,
      );
      const afterRevoke = { ...currentPolicy, Statement: filteredStatements };
      return IamPolicyService.generateDiff(currentPolicy, afterRevoke);
    } catch (error) {
      logger.error('Failed to generate revoke preview', { error, team: request.team });
      throw new ValidationError('Failed to generate revoke preview. Please contact an administrator.');
    }
  }

  static async approve(id: string, input: ApproveRequestInput, user: AuthUser, ip?: string, userAgent?: string) {
    const request = await prisma.accessRequest.findUnique({
      where: { id },
      include: { requester: { select: { email: true, name: true } } },
    });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.status !== 'PENDING') {
      throw new ValidationError(`Cannot approve a request in ${request.status} status`);
    }

    if (request.requesterId === user.id) {
      throw new ValidationError('You cannot approve your own request');
    }

    const existingApprovals = (request.approvals || []) as Array<{ approverId: string }>;
    if (existingApprovals.some((a) => a.approverId === user.id)) {
      throw new ValidationError('You have already approved this request. A different approver is needed.');
    }

    const newApproval = {
      approverId: user.id,
      approverName: user.name,
      approverEmail: user.email,
      approvedAt: new Date().toISOString(),
      notes: input.approverNotes || null,
      durationOverride: input.durationHoursOverride || null,
    };

    const updatedApprovals = [...existingApprovals, newApproval];
    const approvalsRequired = request.approvalsRequired || 1;
    const allApprovalsReceived = updatedApprovals.length >= approvalsRequired;

    // Atomic status guard: only update if status is still PENDING
    const atomicUpdate = await prisma.accessRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        approvals: updatedApprovals.map((a) => JSON.parse(JSON.stringify(a))),
      },
    });

    if (atomicUpdate.count === 0) {
      throw new ValidationError('Request is no longer pending (concurrent modification)');
    }

    await AuditService.log({
      eventType: 'REQUEST_APPROVED',
      requestId: id,
      actorId: user.id,
      actorRole: user.role,
      eventData: {
        approvalNumber: updatedApprovals.length,
        approvalsRequired,
        allApprovalsReceived,
        notes: input.approverNotes,
        durationOverride: input.durationHoursOverride,
      },
      ipAddress: ip,
      userAgent,
    });

    if (!allApprovalsReceived) {
      const updated = await prisma.accessRequest.findUnique({
        where: { id },
        include: {
          requester: { select: { id: true, name: true, email: true, role: true } },
          approver: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      if (!updated) throw new NotFoundError('Access request not found after update');

      SlackService.notifyRequestApproved({
        requestId: id,
        requesterName: request.requester.name,
        approverName: user.name,
        team: request.team || 'default',
        roleLevel: request.roleLevel || 'default',
        environment: request.environment,
        durationHours: request.durationHours,
        expiresAt: `Pending ${approvalsRequired - updatedApprovals.length} more approval(s)`,
        targetAccountId: request.targetAccountId || undefined,
        approverNotes: input.approverNotes,
      }).catch(() => {});

      return { ...updated, _approvalStatus: { received: updatedApprovals.length, required: approvalsRequired } };
    }

    // All approvals received — apply the policy
    const durationHours = input.durationHoursOverride ?? request.durationHours;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    if (!request.team) {
      throw new ValidationError('Cannot apply IAM policy: no team is associated with this request.');
    }
    if (!request.targetAccountId) {
      throw new ValidationError('Cannot apply IAM policy: no target account is associated with this request.');
    }

    const statement = PolicyService.generateStatement({
      requestId: request.id,
      secretArns: request.secretArns,
      actions: request.actionsRequested,
      environment: request.environment,
      durationHours,
      activatedAt: now,
      email: request.requester.email,
      roleLevel: request.roleLevel || undefined,
      targetAccountId: request.targetAccountId,
    });

    const validation = PolicyService.validateStatement(statement);
    if (!validation.valid) {
      throw new ValidationError('Policy statement validation failed', validation.errors);
    }

    const policyDoc = PolicyService.generatePolicyDocument(statement);

    try {
      const currentPolicy = await IamPolicyService.getCurrentPolicy(request.team, request.targetAccountId);
      const proposedPolicy = IamPolicyService.computeProposedPolicy(currentPolicy, statement);
      const sizeCheck = IamPolicyService.validatePolicySize(proposedPolicy);
      if (!sizeCheck.valid) {
        throw new ValidationError(`Policy exceeds maximum size (${sizeCheck.size}/6144 bytes)`);
      }
      await IamPolicyService.applyPolicy(request.team, proposedPolicy, request.targetAccountId);
      logger.info(`Applied IAM policy statement ${statement.Sid} for team ${request.team}`, {
        targetAccount: request.targetAccountId,
      });
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to apply IAM policy', {
        error: errMsg,
        team: request.team,
        statementSid: statement.Sid,
        targetAccount: request.targetAccountId,
      });
      throw new ValidationError(
        `Failed to apply IAM policy for account ${request.targetAccountId}: ${errMsg}`,
      );
    }

    const updated = await prisma.accessRequest.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approverId: user.id,
        approvedAt: now,
        activatedAt: now,
        expiresAt,
        durationHours,
        approverNotes: input.approverNotes,
        approvals: updatedApprovals.map((a) => JSON.parse(JSON.stringify(a))),
        policyStatementId: statement.Sid,
        policyDocument: JSON.parse(JSON.stringify(policyDoc)),
      },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await AuditService.log({
      eventType: 'POLICY_APPLIED',
      requestId: id,
      actorId: user.id,
      actorRole: 'system',
      eventData: { policyDocument: policyDoc, statementSid: statement.Sid },
    });

    SlackService.notifyRequestApproved({
      requestId: id,
      requesterName: updated.requester.name,
      approverName: user.name,
      team: updated.team || 'default',
      roleLevel: updated.roleLevel || 'default',
      environment: updated.environment,
      durationHours,
      expiresAt: expiresAt.toISOString(),
      targetAccountId: updated.targetAccountId || undefined,
      approverNotes: input.approverNotes,
    }).catch(() => {});

    return updated;
  }

  static async reject(id: string, input: RejectRequestInput, user: AuthUser, ip?: string, userAgent?: string) {
    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.status !== 'PENDING') {
      throw new ValidationError(`Cannot reject a request in ${request.status} status`);
    }

    // Atomic guard: only reject if still PENDING
    const atomicCheck = await prisma.accessRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        approverId: user.id,
        rejectedAt: new Date(),
        rejectionNotes: input.rejectionNotes,
      },
    });

    if (atomicCheck.count === 0) {
      throw new ValidationError('Request is no longer pending (concurrent modification)');
    }

    const updated = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await AuditService.log({
      eventType: 'REQUEST_REJECTED',
      requestId: id,
      actorId: user.id,
      actorRole: user.role,
      eventData: { rejectionNotes: input.rejectionNotes },
      ipAddress: ip,
      userAgent,
    });

    if (updated) {
      SlackService.notifyRequestRejected({
        requestId: id,
        requesterName: updated.requester.name,
        approverName: user.name,
        team: updated.team || 'default',
        environment: updated.environment,
        reason: input.rejectionNotes || 'No reason provided',
        targetAccountId: updated.targetAccountId || undefined,
      }).catch(() => {});
    }

    return updated;
  }

  static async cancel(id: string, user: AuthUser, ip?: string, userAgent?: string) {
    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.requesterId !== user.id) {
      throw new ValidationError('Only the requester can cancel their own request');
    }
    if (request.status !== 'PENDING') {
      throw new ValidationError(`Cannot cancel a request in ${request.status} status. Only pending requests can be cancelled.`);
    }

    const atomicCheck = await prisma.accessRequest.updateMany({
      where: { id, status: 'PENDING', requesterId: user.id },
      data: { status: 'REJECTED', rejectionNotes: 'Cancelled by requester' },
    });

    if (atomicCheck.count === 0) {
      throw new ValidationError('Request is no longer pending (concurrent modification)');
    }

    const updated = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await AuditService.log({
      eventType: 'REQUEST_CANCELLED',
      requestId: id,
      actorId: user.id,
      actorRole: user.role,
      eventData: { cancelledByRequester: true },
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  static async revoke(id: string, user: AuthUser, ip?: string, userAgent?: string) {
    const request = await prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError('Access request not found');
    if (request.status !== 'ACTIVE') {
      throw new ValidationError(`Cannot revoke a request in ${request.status} status`);
    }

    // Atomic guard: only revoke if still ACTIVE
    const atomicCheck = await prisma.accessRequest.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    if (atomicCheck.count === 0) {
      throw new ValidationError('Request is no longer active (concurrent modification)');
    }

    // Remove statement from IAM policy
    let iamCleanupFailed = false;
    if (request.team && request.policyStatementId && request.targetAccountId) {
      try {
        const currentPolicy = await IamPolicyService.getCurrentPolicy(request.team, request.targetAccountId);
        const filteredStatements = currentPolicy.Statement.filter(
          (s) => s.Sid !== request.policyStatementId,
        );
        const cleanedPolicy = { ...currentPolicy, Statement: filteredStatements };
        await IamPolicyService.applyPolicy(request.team, cleanedPolicy, request.targetAccountId);
        logger.info(`Removed IAM policy statement ${request.policyStatementId} on revocation`, {
          targetAccount: request.targetAccountId,
        });
      } catch (error) {
        iamCleanupFailed = true;
        logger.error('Failed to remove IAM policy statement on revocation', {
          error,
          team: request.team,
          statementId: request.policyStatementId,
          targetAccount: request.targetAccountId,
        });
      }
    }

    // If IAM cleanup failed, mark as ROLLBACK_FAILED so it can be retried
    if (iamCleanupFailed) {
      await prisma.accessRequest.update({
        where: { id },
        data: { status: 'ROLLBACK_FAILED' },
      });
    }

    const updated = await prisma.accessRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await AuditService.log({
      eventType: 'POLICY_REVOKED',
      requestId: id,
      actorId: user.id,
      actorRole: user.role,
      eventData: { policyStatementId: request.policyStatementId, revokedManually: true },
      ipAddress: ip,
      userAgent,
    });

    const requester = await prisma.user.findUnique({
      where: { id: request.requesterId },
      select: { name: true, email: true },
    });

    SlackService.notifyAccessRevoked({
      requestId: id,
      requesterName: requester?.name ?? 'Unknown',
      revokedBy: user.name,
      team: request.team || 'default',
      environment: request.environment,
      targetAccountId: request.targetAccountId || undefined,
    }).catch(() => {});

    return updated;
  }

  static async getStats(user: AuthUser) {
    const baseWhere = user.role === 'REQUESTER' ? { requesterId: user.id } : {};

    const [pending, active, expired, rejected, revoked, total] = await Promise.all([
      prisma.accessRequest.count({ where: { ...baseWhere, status: 'PENDING' } }),
      prisma.accessRequest.count({ where: { ...baseWhere, status: 'ACTIVE' } }),
      prisma.accessRequest.count({ where: { ...baseWhere, status: 'EXPIRED' } }),
      prisma.accessRequest.count({ where: { ...baseWhere, status: 'REJECTED' } }),
      prisma.accessRequest.count({ where: { ...baseWhere, status: 'REVOKED' } }),
      prisma.accessRequest.count({ where: baseWhere }),
    ]);

    const recentActivity = await prisma.auditLog.findMany({
      orderBy: { eventTime: 'desc' },
      take: 10,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        request: { select: { id: true, status: true, environment: true } },
      },
      ...(user.role === 'REQUESTER' && { where: { actorId: user.id } }),
    });

    const expiringSoon = await prisma.accessRequest.findMany({
      where: {
        ...baseWhere,
        status: 'ACTIVE',
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    return { pending, active, expired, rejected, revoked, total, recentActivity, expiringSoon };
  }
}
