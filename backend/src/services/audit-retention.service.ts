import { prisma } from '../utils/prisma';
import { uploadToS3 } from '../utils/s3';
import { logger } from '../utils/logger';

const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '7', 10);
const BATCH_SIZE = 500;

export class AuditRetentionService {
  /**
   * Archives the previous day's logs to S3.
   * Logs remain in the DB for querying — only marked with s3Key.
   */
  static async archiveDailyLogs(): Promise<{ archived: number }> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCDate(dayStart.getUTCDate() - 1);
    dayStart.setUTCHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const dateStr = dayStart.toISOString().split('T')[0];
    logger.info(`Archiving audit logs for ${dateStr} to S3`);

    let totalArchived = 0;
    let batchIndex = 0;

    while (true) {
      const logs = await prisma.auditLog.findMany({
        where: {
          eventTime: { gte: dayStart, lte: dayEnd },
          s3Key: null,
        },
        take: BATCH_SIZE,
        orderBy: { eventTime: 'asc' },
        include: {
          actor: { select: { email: true, name: true } },
          request: { select: { environment: true, team: true, targetAccountId: true, justification: true, approverNotes: true } },
        },
      });

      if (logs.length === 0) break;

      const s3Key = `audit-logs/${dateStr}/batch-${batchIndex}.json`;

      const payload = JSON.stringify({
        date: dateStr,
        exportedAt: now.toISOString(),
        batchIndex,
        count: logs.length,
        logs,
      }, null, 2);

      await uploadToS3(s3Key, payload);

      const ids = logs.map((log) => log.id);
      await prisma.auditLog.updateMany({
        where: { id: { in: ids } },
        data: { s3Key },
      });

      totalArchived += logs.length;
      batchIndex++;
      logger.info(`Archived batch ${batchIndex}: ${logs.length} logs → s3://${s3Key}`);
    }

    logger.info(`Daily archive complete for ${dateStr}. Total archived: ${totalArchived}`);
    return { archived: totalArchived };
  }

  /**
   * Deletes logs older than RETENTION_DAYS from the DB.
   * Only deletes logs that have already been archived to S3.
   */
  static async purgeExpiredLogs(): Promise<{ deleted: number }> {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RETENTION_DAYS);

    logger.info(`Purging audit logs older than ${cutoffDate.toISOString()} (${RETENTION_DAYS} days)`);

    const { count } = await prisma.auditLog.deleteMany({
      where: {
        eventTime: { lt: cutoffDate },
        s3Key: { not: null },
      },
    });

    logger.info(`Purge complete. Deleted ${count} logs from database`);
    return { deleted: count };
  }
}
