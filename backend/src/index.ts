import dotenv from 'dotenv';
dotenv.config();

import { execSync } from 'child_process';
import { logger } from './utils/logger';
import { loadSecrets } from './utils/secrets';

async function bootstrap() {
  const secrets = await loadSecrets();

  const dbHost = process.env.DB_HOST || 'postgres';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'iam_access_platform';
  const dbUser = process.env.DB_USER || 'postgres';

  process.env.DATABASE_URL = `postgresql://${dbUser}:${encodeURIComponent(secrets.dbPassword)}@${dbHost}:${dbPort}/${dbName}?schema=public`;

  logger.info('Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  logger.info('Migrations complete.');

  const { default: app } = await import('./app');
  const { startScheduler } = await import('./scheduler');

  const PORT = process.env.PORT || 3001;

  app.listen(PORT, () => {
    logger.info(`IAM Access Request API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    startScheduler();
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start application', { error: err });
  process.exit(1);
});
