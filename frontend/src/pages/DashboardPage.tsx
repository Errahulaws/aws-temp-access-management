import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { requestsApi } from '@/lib/api';
import { StatCard, Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StatusBadge, AccountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { DashboardStats, AccessRequest, AuditLog } from '@/types';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Activity,
  FilePlus2,
  ArrowRight,
  FileKey,
  Timer,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    requestsApi.stats()
      .then(({ data }) => setStats(data))
      .catch((err) => {
        if (err?.response?.status !== 401) {
          toast.error('Failed to load dashboard');
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-slate-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here's an overview of your access request activity
          </p>
        </div>
        {user?.role !== 'AUDITOR' && (
          <Button onClick={() => navigate('/requests/new')} icon={<FilePlus2 className="h-4 w-4" />}>
            New Request
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Pending Approval"
          value={stats?.pending ?? 0}
          icon={<Clock className="h-5 w-5" />}
          color="amber"
        />
        <StatCard
          title="Active Grants"
          value={stats?.active ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="emerald"
        />
        <StatCard
          title="Rejected"
          value={stats?.rejected ?? 0}
          icon={<XCircle className="h-5 w-5" />}
          color="red"
        />
        <StatCard
          title="Expired"
          value={stats?.expired ?? 0}
          icon={<Timer className="h-5 w-5" />}
          color="slate"
        />
        <StatCard
          title="Revoked"
          value={stats?.revoked ?? 0}
          icon={<Shield className="h-5 w-5" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring Soon */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">Expiring Within 24 Hours</h3>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {stats?.expiringSoon && stats.expiringSoon.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {stats.expiringSoon.map((req: AccessRequest) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/requests/${req.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <FileKey className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                          {req.secretArns?.[0]?.split(':').pop() ?? 'Secret'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {req.expiresAt ? formatRelativeTime(req.expiresAt) : ''}
                        </p>
                      </div>
                    </div>
                    <AccountBadge label={req.accountLabel} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-slate-500">No grants expiring soon</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary-500" />
              <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
            </div>
            {(user?.role === 'APPROVER' || user?.role === 'AUDITOR') && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/audit')}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {stats.recentActivity.slice(0, 6).map((log: AuditLog) => (
                  <div key={log.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                        <EventIcon eventType={log.eventType} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatEventType(log.eventType)}</p>
                        <p className="text-xs text-slate-500">
                          {log.actor?.name ?? 'System'} &middot; {formatDate(log.eventTime)}
                        </p>
                      </div>
                    </div>
                    {log.request && <StatusBadge status={log.request.status} />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-slate-500">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatEventType(type: string) {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function EventIcon({ eventType }: { eventType: string }) {
  switch (eventType) {
    case 'REQUEST_CREATED': return <FilePlus2 className="h-4 w-4 text-blue-500" />;
    case 'REQUEST_APPROVED': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'REQUEST_REJECTED': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'POLICY_APPLIED': return <Shield className="h-4 w-4 text-emerald-500" />;
    case 'POLICY_REVOKED': return <Shield className="h-4 w-4 text-purple-500" />;
    default: return <Activity className="h-4 w-4 text-slate-400" />;
  }
}
