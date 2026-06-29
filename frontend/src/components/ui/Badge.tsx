import { cn } from '@/lib/utils';
import type { RequestStatus, Environment } from '@/types';

const statusConfig: Record<RequestStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  APPROVED: { label: 'Approved', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  EXPIRED: { label: 'Expired', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  REVOKED: { label: 'Revoked', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  ROLLBACK_FAILED: { label: 'Rollback Failed', className: 'bg-red-200 text-red-900 border-red-300' },
};

const envConfig: Record<Environment, { className: string }> = {
  dev: { className: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  staging: { className: 'bg-orange-100 text-orange-800 border-orange-200' },
  prod: { className: 'bg-red-100 text-red-800 border-red-200' },
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-colors',
        variant === 'default' ? 'bg-primary-100 text-primary-800 border-primary-200' : 'bg-transparent',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border', config.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-amber-500': status === 'PENDING',
        'bg-blue-500': status === 'APPROVED',
        'bg-red-500': status === 'REJECTED' || status === 'ROLLBACK_FAILED',
        'bg-emerald-500 animate-pulse': status === 'ACTIVE',
        'bg-slate-400': status === 'EXPIRED',
        'bg-purple-500': status === 'REVOKED',
      })} />
      {config.label}
    </span>
  );
}

export function EnvironmentBadge({ env }: { env: Environment }) {
  const config = envConfig[env];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider border', config.className)}>
      {env}
    </span>
  );
}

const accountColorMap: Record<string, string> = {
  production: 'bg-red-100 text-red-800 border-red-200',
  dev: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  uat: 'bg-orange-100 text-orange-800 border-orange-200',
  devsigner: 'bg-violet-100 text-violet-800 border-violet-200',
};

export function AccountBadge({ label }: { label?: string }) {
  if (!label) return null;
  const key = label.toLowerCase().replace(/\s+/g, '');
  const colorClass = accountColorMap[key] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider border', colorClass)}>
      {label}
    </span>
  );
}
