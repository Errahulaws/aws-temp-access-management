export type Role = 'REQUESTER' | 'APPROVER' | 'AUDITOR';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROLLBACK_FAILED';

export type Environment = 'dev' | 'staging' | 'prod';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  roles: Role[];
  department?: string;
  mfaEnabled?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  activeGrants?: number;
}

export interface ApprovalEntry {
  approverId: string;
  approverName: string;
  approverEmail: string;
  approvedAt: string;
  notes?: string;
}

export interface AccessRequest {
  id: string;
  requesterId: string;
  requester: Pick<User, 'id' | 'name' | 'email' | 'role' | 'department'>;
  approverId?: string;
  approver?: Pick<User, 'id' | 'name' | 'email' | 'role'>;
  secretArns: string[];
  actionsRequested: string[];
  justification: string;
  environment: Environment;
  durationHours: number;
  status: RequestStatus;
  team?: string;
  roleLevel?: string;
  accessScope?: 'specific' | 'all';
  targetAccountId?: string;
  accountLabel?: string;
  approvalsRequired?: number;
  approvals?: ApprovalEntry[];
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  activatedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  rejectionNotes?: string;
  approverNotes?: string;
  policyStatementId?: string;
  policyDocument?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  auditLogs?: AuditLog[];
  _approvalStatus?: { received: number; required: number };
}

export interface AuditLog {
  id: string;
  eventType: string;
  requestId?: string;
  request?: Pick<AccessRequest, 'id' | 'status' | 'environment' | 'secretArns'>;
  actorId?: string;
  actor?: Pick<User, 'id' | 'name' | 'email' | 'role'>;
  actorRole?: string;
  eventData?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  eventTime: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  pending: number;
  active: number;
  expired: number;
  rejected: number;
  revoked: number;
  total: number;
  recentActivity: AuditLog[];
  expiringSoon: AccessRequest[];
}
