import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { StatusBadge, AccountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { AccessRequest, PaginatedResponse } from '@/types';
import { FileText, ChevronLeft, ChevronRight, Search, FileKey } from 'lucide-react';
import toast from 'react-hot-toast';

export function RequestsListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaginatedResponse<AccessRequest> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', environment: '', page: 1 });

  useEffect(() => {
    setIsLoading(true);
    const params: Record<string, string | number> = { page: filters.page, limit: 20 };
    if (filters.status) params.status = filters.status;
    if (filters.environment) params.environment = filters.environment;

    requestsApi.list(params)
      .then(({ data: res }) => setData(res))
      .catch((err) => {
        if (err?.response?.status !== 401) {
          toast.error('Failed to load requests');
        }
      })
      .finally(() => setIsLoading(false));
  }, [filters]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Access Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total} total requests` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <Search className="h-4 w-4 text-slate-400" />
            <Select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'APPROVED', label: 'Approved' },
                { value: 'REJECTED', label: 'Rejected' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'REVOKED', label: 'Revoked' },
              ]}
              className="w-44"
            />
            <Select
              value={filters.environment}
              onChange={(e) => setFilters((f) => ({ ...f, environment: e.target.value, page: 1 }))}
              options={[
                { value: '', label: 'All Environments' },
                { value: 'dev', label: 'Development' },
                { value: 'staging', label: 'Staging' },
                { value: 'prod', label: 'Production' },
              ]}
              className="w-44"
            />
          </div>
        </CardContent>
      </Card>

      {/* Request List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No requests found"
          description="No access requests match your current filters."
        />
      ) : (
        <div className="space-y-3">
          {data?.data.map((request) => (
            <Card
              key={request.id}
              hover
              onClick={() => navigate(`/requests/${request.id}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                      <FileKey className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {request.secretArns[0]?.split(':').pop()?.split('/').pop() ?? 'Secret'}
                        </p>
                        {request.secretArns.length > 1 && (
                          <span className="text-xs text-slate-500">+{request.secretArns.length - 1} more</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-500">
                          {request.requester?.name} &middot; {formatDate(request.createdAt)}
                        </p>
                        {request.status === 'ACTIVE' && request.expiresAt && (
                          <span className="text-xs text-emerald-600 font-medium">
                            {formatRelativeTime(request.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <AccountBadge label={request.accountLabel} />
                    <StatusBadge status={request.status} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
