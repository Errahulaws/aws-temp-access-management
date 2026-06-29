export interface TeamConfig {
  id: string;
  label: string;
  policyArn: string;
}

export interface RoleLevel {
  id: string;
  label: string;
  team: string;
}

const TEAM_DEFINITIONS: { id: string; label: string }[] = [
  { id: 'developer', label: 'Developer' },
  { id: 'devops', label: 'DevOps' },
  { id: 'security', label: 'Security' },
];

const ROLE_LEVEL_DEFINITIONS: { id: string; label: string; team: string }[] = [
  { id: 'developer', label: 'Developer', team: 'developer' },
  { id: 'devops-l1', label: 'DevOps L1', team: 'devops' },
  { id: 'devops-l2', label: 'DevOps L2', team: 'devops' },
  { id: 'devops-l3', label: 'DevOps L3', team: 'devops' },
  { id: 'security-l1', label: 'Security L1', team: 'security' },
  { id: 'security-l2', label: 'Security L2', team: 'security' },
  { id: 'security-l3', label: 'Security L3', team: 'security' },
];

/**
 * Returns teams configured for a specific account.
 * Looks for TEAM_<TEAM>_<ACCOUNT_ID>_POLICY_ARN — only returns teams with a value set.
 */
export function getTeamsForAccount(accountId: string): TeamConfig[] {
  return TEAM_DEFINITIONS
    .map((def) => {
      const policyArn = process.env[`TEAM_${def.id.toUpperCase()}_${accountId}_POLICY_ARN`] || '';
      return { id: def.id, label: def.label, policyArn };
    })
    .filter((t) => t.policyArn !== '');
}

/**
 * Gets team config for a specific account.
 */
export function getTeamConfig(teamId: string, accountId: string): TeamConfig | undefined {
  return getTeamsForAccount(accountId).find((t) => t.id === teamId);
}

export interface RoleLevelConfig {
  id: string;
  label: string;
  team: string;
  awsRoleId: string;
}

/**
 * Returns role levels configured for a specific team + account.
 * Looks for ROLE_ID_<ROLE>_<ACCOUNT_ID> — only returns levels with a value set.
 */
export function getRoleLevelsForTeam(teamId: string, accountId: string): RoleLevelConfig[] {
  return ROLE_LEVEL_DEFINITIONS
    .filter((rl) => rl.team === teamId)
    .map((rl) => {
      const envVar = `ROLE_ID_${rl.id.toUpperCase().replace(/-/g, '_')}_${accountId}`;
      const awsRoleId = process.env[envVar] || '';
      return { id: rl.id, label: rl.label, team: rl.team, awsRoleId };
    })
    .filter((rl) => rl.awsRoleId !== '');
}

/**
 * Gets role level config for a specific account.
 */
export function getRoleLevelConfig(roleLevelId: string, accountId: string): RoleLevelConfig | undefined {
  const def = ROLE_LEVEL_DEFINITIONS.find((rl) => rl.id === roleLevelId);
  if (!def) return undefined;

  const envVar = `ROLE_ID_${def.id.toUpperCase().replace(/-/g, '_')}_${accountId}`;
  const awsRoleId = process.env[envVar] || '';
  if (!awsRoleId) return undefined;

  return { id: def.id, label: def.label, team: def.team, awsRoleId };
}

/**
 * Builds the aws:userid value for a policy condition.
 * Format: ROLE_ID:user@email.com
 * Uses ROLE_ID_<ROLE>_<ACCOUNT_ID> env var for the given account.
 */
export function buildAwsUserId(roleLevelId: string, email: string, accountId: string): string | undefined {
  const roleLevel = getRoleLevelConfig(roleLevelId, accountId);
  if (!roleLevel) return undefined;
  return `${roleLevel.awsRoleId}:${email}`;
}
