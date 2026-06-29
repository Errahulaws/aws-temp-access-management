import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger';

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

const SECRET_NAME = process.env.APP_SECRET_NAME || 'iam-platform/app-secrets';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface AppSecrets {
  dbPassword: string;
  jwtSecret: string;
  jumpcloudClientId: string;
  jumpcloudClientSecret: string;
  stsExternalId?: string;
}

let cachedSecrets: AppSecrets | null = null;
let cacheExpiry = 0;

async function fetchFromSecretsManager(): Promise<AppSecrets> {
  const now = Date.now();
  if (cachedSecrets && now < cacheExpiry) {
    return cachedSecrets;
  }

  const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`Secret ${SECRET_NAME} has no string value`);
  }

  const parsed = JSON.parse(response.SecretString);

  const dbPassword = parsed.DB_PASSWORD || parsed.db_password;
  const jwtSecret = parsed.JWT_SECRET || parsed.jwt_secret;
  const jumpcloudClientId = parsed.JUMPCLOUD_CLIENT_ID || parsed.jumpcloud_client_id;
  const jumpcloudClientSecret = parsed.JUMPCLOUD_CLIENT_SECRET || parsed.jumpcloud_client_secret;
  const stsExternalId = parsed.STS_EXTERNAL_ID || parsed.sts_external_id || undefined;

  if (!dbPassword) throw new Error('DB_PASSWORD not found in secret');
  if (!jwtSecret) throw new Error('JWT_SECRET not found in secret');
  if (!jumpcloudClientId) throw new Error('JUMPCLOUD_CLIENT_ID not found in secret');
  if (!jumpcloudClientSecret) throw new Error('JUMPCLOUD_CLIENT_SECRET not found in secret');

  cachedSecrets = { dbPassword, jwtSecret, jumpcloudClientId, jumpcloudClientSecret, stsExternalId };
  cacheExpiry = now + CACHE_TTL_MS;

  return cachedSecrets;
}

export async function loadSecrets(): Promise<AppSecrets> {
  logger.info(`Fetching secrets from Secrets Manager: ${SECRET_NAME}`);
  const secrets = await fetchFromSecretsManager();
  logger.info('Secrets loaded successfully from Secrets Manager');
  return secrets;
}

export async function getJwtSecret(): Promise<string> {
  const secrets = await fetchFromSecretsManager();
  return secrets.jwtSecret;
}

export async function getDbPassword(): Promise<string> {
  const secrets = await fetchFromSecretsManager();
  return secrets.dbPassword;
}

export async function getSsoCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const secrets = await fetchFromSecretsManager();
  return { clientId: secrets.jumpcloudClientId, clientSecret: secrets.jumpcloudClientSecret };
}

export async function getExternalId(): Promise<string> {
  const secrets = await fetchFromSecretsManager();
  if (!secrets.stsExternalId) {
    throw new Error('STS_EXTERNAL_ID not found in secret. Add it to your APP_SECRET_NAME secret for cross-account access.');
  }
  return secrets.stsExternalId;
}
