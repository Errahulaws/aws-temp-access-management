import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

interface AuditEntry {
  eventType: string;
  requestId?: string;
  actorId?: string;
  actorRole?: string;
  eventData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  static async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          eventType: entry.eventType,
          requestId: entry.requestId,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          eventData: (entry.eventData ?? {}) as object,
          ipAddress: entry.ipAddress?.slice(0, 45),
          userAgent: entry.userAgent?.slice(0, 512),
        },
      });
    } catch (error) {
      logger.error('Failed to write audit log', { entry, error });
    }
  }

  static async getByRequestId(requestId: string) {
    return prisma.auditLog.findMany({
      where: { requestId },
      orderBy: { eventTime: 'asc' },
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    });
  }

  static async query(params: {
    eventType?: string;
    actorId?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (params.eventType) where.eventType = params.eventType;
    if (params.actorId) where.actorId = params.actorId;
    if (params.startDate || params.endDate) {
      where.eventTime = {
        ...(params.startDate && { gte: params.startDate }),
        ...(params.endDate && { lte: params.endDate }),
      };
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
          request: { select: { id: true, status: true, environment: true, secretArns: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) };
  }
}
