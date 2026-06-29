import { getExternalId } from '../utils/secrets';

export { getExternalId };

export interface AccountConfig {
  id: string;
  accountId: string;
  label: string;
  roleArn: string;
}

/**
 * Parses ACCOUNT_* environment variables to discover configured target accounts.
 * 
 * Expected env var pattern:
 *   ACCOUNT_<ACCOUNT_ID>_ROLE_ARN=arn:aws:iam::<account-id>:role/IAMPlatformAccess
 *   ACCOUNT_<ACCOUNT_ID>_LABEL=Production Account
 */
function discoverAccountEnvVars(): { accountId: string; roleArnEnv: string; labelEnv: string }[] {
  const accounts: Map<string, { accountId: string; roleArnEnv: string; labelEnv: string }> = new Map();
  const roleArnPattern = /^ACCOUNT_(\d{12})_ROLE_ARN$/;

  for (const key of Object.keys(process.env)) {
    const match = key.match(roleArnPattern);
    if (match) {
      const accountId = match[1];
      accounts.set(accountId, {
        accountId,
        roleArnEnv: key,
        labelEnv: `ACCOUNT_${accountId}_LABEL`,
      });
    }
  }

  return Array.from(accounts.values());
}

/**
 * Returns all configured target accounts (those with ACCOUNT_*_ROLE_ARN set).
 */
export function getAccounts(): AccountConfig[] {
  return discoverAccountEnvVars()
    .map((def) => {
      const roleArn = process.env[def.roleArnEnv] || '';
      if (!roleArn) return null;

      return {
        id: def.accountId,
        accountId: def.accountId,
        label: process.env[def.labelEnv] || `Account ${def.accountId}`,
        roleArn,
      };
    })
    .filter((a): a is AccountConfig => a !== null);
}

/**
 * Gets configuration for a specific account.
 */
export function getAccountConfig(accountId: string): AccountConfig | undefined {
  return getAccounts().find((a) => a.accountId === accountId);
}
