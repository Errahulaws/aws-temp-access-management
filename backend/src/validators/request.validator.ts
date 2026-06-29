import { z } from 'zod';
import { getAccountConfig } from '../config/accounts';
import { getTeamConfig, getRoleLevelConfig } from '../config/teams';

const SECRET_ARN_REGEX = /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/;

const ALLOWED_ACTIONS = [
  'secretsmanager:GetSecretValue',
  'secretsmanager:DescribeSecret',
  'secretsmanager:ListSecretVersionIds',
  'secretsmanager:UpdateSecret',
  'secretsmanager:PutSecretValue',
  'secretsmanager:CreateSecret',
  'secretsmanager:TagResource',
] as const;

const SECRET_ARN_OR_WILDCARD_REGEX = /^arn:aws:secretsmanager:[a-z0-9*-]+:\d{12}:secret:.+$/;

export const createRequestSchema = z.object({
  secretArns: z
    .array(z.string())
    .min(1, 'At least one secret ARN is required')
    .max(10, 'Maximum 10 secret ARNs per request'),
  actionsRequested: z
    .array(z.enum(ALLOWED_ACTIONS))
    .min(1, 'At least one action is required'),
  justification: z
    .string()
    .min(30, 'Justification must be at least 30 characters')
    .max(2000, 'Justification must not exceed 2000 characters')
    .refine(
      (val) => !/<script|<\/script|javascript:|on\w+=/i.test(val),
      'Justification contains potentially unsafe content',
    ),
  environment: z.enum(['dev', 'staging', 'prod']).default('prod'),
  durationHours: z
    .number()
    .min(0.5, 'Minimum duration is 30 minutes')
    .max(8, 'Maximum duration is 8 hours')
    .refine((v) => v * 2 === Math.round(v * 2), 'Duration must be in 30-minute increments'),
  team: z.string().min(1, 'Team is required').max(50, 'Team name too long'),
  roleLevel: z.string().min(1, 'Role level is required').max(50, 'Role level too long'),
  accessScope: z.enum(['specific', 'all']).default('specific'),
  awsAccountId: z.string().regex(/^\d{12}$/, 'AWS Account ID must be 12 digits').optional(),
  targetAccountId: z.string().regex(/^\d{12}$/, 'Target Account ID must be 12 digits'),
  principalArn: z.string().max(256, 'Principal ARN too long').regex(/^arn:aws:iam::\d{12}:(role|user)\/.+$/, 'Invalid IAM principal ARN format').optional(),
}).superRefine((data, ctx) => {
  // Validate ARN format
  if (data.accessScope === 'all') {
    for (let i = 0; i < data.secretArns.length; i++) {
      if (data.secretArns[i] !== '*' && !SECRET_ARN_OR_WILDCARD_REGEX.test(data.secretArns[i])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid ARN format', path: ['secretArns', i] });
      }
    }
  } else {
    for (let i = 0; i < data.secretArns.length; i++) {
      if (!SECRET_ARN_REGEX.test(data.secretArns[i])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Secrets Manager ARN format', path: ['secretArns', i] });
      }
    }
  }

  // Validate targetAccountId is a configured account
  if (!getAccountConfig(data.targetAccountId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Account ${data.targetAccountId} is not configured`, path: ['targetAccountId'] });
    return;
  }

  // Validate team exists for the selected account
  if (!getTeamConfig(data.team, data.targetAccountId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Team '${data.team}' is not configured for account ${data.targetAccountId}`, path: ['team'] });
    return;
  }

  // Validate roleLevel exists for the selected team and account
  const roleLevelConfig = getRoleLevelConfig(data.roleLevel, data.targetAccountId);
  if (!roleLevelConfig) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Role level '${data.roleLevel}' is not configured for account ${data.targetAccountId}`, path: ['roleLevel'] });
    return;
  }

  // Validate roleLevel belongs to the specified team
  if (roleLevelConfig.team !== data.team) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Role level '${data.roleLevel}' does not belong to team '${data.team}'`, path: ['roleLevel'] });
  }
});

export const approveRequestSchema = z.object({
  durationHoursOverride: z
    .number()
    .min(0.5, 'Minimum override is 30 minutes')
    .max(168, 'Maximum override is 7 days (168 hours)')
    .optional(),
  approverNotes: z
    .string()
    .min(10, 'Approver notes must be at least 10 characters')
    .max(2000, 'Approver notes must not exceed 2000 characters'),
});

export const rejectRequestSchema = z.object({
  rejectionNotes: z
    .string()
    .min(10, 'Rejection notes must be at least 10 characters')
    .max(2000),
});

export const listRequestsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ROLLBACK_FAILED']).optional(),
  environment: z.enum(['dev', 'staging', 'prod']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'expiresAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;
export type ListRequestsInput = z.infer<typeof listRequestsSchema>;
