import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auditApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
import type { AuditLog, PaginatedResponse } from '@/types';
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Shield,
  FilePlus2,
  Activity,
  User,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'REQUEST_CREATED', label: 'Request Created' },
  { value: 'REQUEST_APPROVED', label: 'Request Approved' },
  { value: 'REQUEST_REJECTED', label: 'Request Rejected' },
  { value: 'POLICY_APPLIED', label: 'Policy Applied' },
  { value: 'POLICY_REVOKED', label: 'Policy Revoked' },
  { value: 'USER_LOGIN', label: 'User Login' },
  { value: 'REVOCATION_FAILED', label: 'Revocation Failed' },
];

export function AuditPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedResponse<AuditLog> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ eventType: '', page: 1 });

  useEffect(() => {
    setIsLoading(true);
    const params: Record<string, string | number> = { page: filters.page, limit: 25 };
    if (filters.eventType) params.eventType = filters.eventType;

    auditApi.query(params)
      .then(({ data: res }) => setData(res))
      .catch((err) => {
        if (err?.response?.status !== 401) {
          toast.error('Failed to load audit logs');
        }
      })
      .finally(() => setIsLoading(false));
  }, [filters]);

  const eventColors: Record<string, string> = {
    REQUEST_CREATED: 'bg-blue-100 text-blue-600',
    REQUEST_APPROVED: 'bg-emerald-100 text-emerald-600',
    REQUEST_REJECTED: 'bg-red-100 text-red-600',
    POLICY_APPLIED: 'bg-emerald-100 text-emerald-600',
    POLICY_REVOKED: 'bg-purple-100 text-purple-600',
    USER_LOGIN: 'bg-slate-100 text-slate-600',
    REVOCATION_FAILED: 'bg-red-200 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Immutable record of all platform events &middot; {data ? `${data.total} entries` : 'Loading...'}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <ScrollText className="h-4 w-4 text-slate-400" />
            <Select
              value={filters.eventType}
              onChange={(e) => setFilters({ eventType: e.target.value, page: 1 })}
              options={EVENT_TYPES}
              className="w-52"
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Entries */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No audit entries"
          description="No audit log entries match your current filters."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Event</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Actor</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Request</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.data.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className={cn('flex h-7 w-7 items-center justify-center rounded-full', eventColors[log.eventType] || 'bg-slate-100 text-slate-500')}>
                            <EventIcon eventType={log.eventType} />
                          </div>
                          <span className="text-sm font-medium text-slate-900">
                            {formatEventLabel(log.eventType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700">{log.actor?.name ?? 'System'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        {log.requestId ? (
                          <button
                            onClick={() => navigate(`/requests/${log.requestId}`)}
                            className="flex items-center gap-1 text-xs font-mono text-primary-600 hover:underline"
                          >
                            {log.requestId.slice(0, 8)}...
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-500">{formatDate(log.eventTime)}</td>
                      <td className="px-6 py-3 text-xs font-mono text-slate-500">{log.ipAddress || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={data.page >= data.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatEventLabel(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function EventIcon({ eventType }: { eventType: string }) {
  switch (eventType) {
    case 'REQUEST_CREATED': return <FilePlus2 className="h-3.5 w-3.5" />;
    case 'REQUEST_APPROVED': return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'REQUEST_REJECTED': return <XCircle className="h-3.5 w-3.5" />;
    case 'POLICY_APPLIED': return <Shield className="h-3.5 w-3.5" />;
    case 'POLICY_REVOKED': return <Shield className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}
