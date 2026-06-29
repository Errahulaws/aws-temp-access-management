import cron from 'node-cron';
import { AuditRetentionService } from './services/audit-retention.service';
import { ExpirationService } from './services/expiration.service';
import { logger } from './utils/logger';

export function startScheduler(): void {
  // Expire active requests and remove IAM policy statements — runs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await ExpirationService.processExpiredRequests();
      if (result.expired > 0) {
        logger.info('Expiration check completed', result);
      }
    } catch (error) {
      logger.error('Expiration check failed', { error });
    }
  });

  // Archive previous day's logs to S3 — runs daily at 01:00 UTC
  cron.schedule('0 1 * * *', async () => {
    logger.info('Scheduled daily S3 archive triggered');
    try {
      const result = await AuditRetentionService.archiveDailyLogs();
      logger.info('Daily S3 archive completed', result);
    } catch (error) {
      logger.error('Daily S3 archive failed', { error });
    }
  });

  // Purge logs older than 7 days from DB — runs daily at 02:00 UTC
  cron.schedule('0 2 * * *', async () => {
    logger.info('Scheduled DB purge triggered');
    try {
      const result = await AuditRetentionService.purgeExpiredLogs();
      logger.info('DB purge completed', result);
    } catch (error) {
      logger.error('DB purge failed', { error });
    }
  });

  logger.info('Scheduler started: expiration check every 5 min, S3 archive at 01:00 UTC, DB purge at 02:00 UTC');
}
