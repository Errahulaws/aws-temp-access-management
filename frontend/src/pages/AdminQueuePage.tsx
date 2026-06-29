import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, requestsApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StatusBadge, AccountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
import type { AccessRequest } from '@/types';
import {
  Shield,
  CheckCircle2,
  XCircle,
  User,
  Clock,
  FileKey,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AdminQueuePage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'PENDING' | 'ACTIVE' | 'all'>('PENDING');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [durationOverride, setDurationOverride] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [policyDiff, setPolicyDiff] = useState<{ current: string; proposed: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadRequests = () => {
    setIsLoading(true);
    const status = tab === 'all' ? undefined : tab;
    adminApi.requests(status)
      .then(({ data }) => setRequests(Array.isArray(data) ? data : data.data || []))
      .catch((err) => {
        if (err?.response?.status !== 401) {
          toast.error('Failed to load requests');
        }
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadRequests(); }, [tab]);

  const handleApprove = async () => {
    if (!selectedId) return;
    if (approveNotes.trim().length < 10) {
      toast.error('Approver notes are required (at least 10 characters)');
      return;
    }
    setActionLoading(true);
    try {
      const payload: { durationHoursOverride?: number; approverNotes: string } = {
        approverNotes: approveNotes.trim(),
      };
      if (durationOverride) payload.durationHoursOverride = parseInt(durationOverride);
      await requestsApi.approve(selectedId, payload);
      toast.success('Request approved successfully!');
      setApproveModal(false);
      setApproveNotes('');
      setDurationOverride('');
      loadRequests();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId || rejectNotes.length < 10) {
      toast.error('Rejection notes must be at least 10 characters');
      return;
    }
    setActionLoading(true);
    try {
      await requestsApi.reject(selectedId, { rejectionNotes: rejectNotes });
      toast.success('Request rejected');
      setRejectModal(false);
      setRejectNotes('');
      loadRequests();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Rejection failed');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Approval Queue</h1>
          {pendingCount > 0 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">Review and manage incoming access requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {(['PENDING', 'ACTIVE', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t === 'all' ? 'All Requests' : t === 'PENDING' ? 'Pending Approval' : 'Active Grants'}
          </button>
        ))}
      </div>

      {/* Request List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-200 rounded-xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title={tab === 'PENDING' ? 'No pending requests' : 'No requests found'}
          description={tab === 'PENDING' ? 'All access requests have been reviewed.' : 'No requests match the current filter.'}
        />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id} className="overflow-hidden">
              <CardContent className="py-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <StatusBadge status={req.status} />
                      <AccountBadge label={req.accountLabel} />
                      {req.accountLabel?.toLowerCase() === 'production' && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                          <AlertTriangle className="h-3 w-3" /> Production
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <FileKey className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {req.secretArns[0]?.split(':').pop()}
                            </p>
                            {req.secretArns.length > 1 && (
                              <p className="text-xs text-slate-500">+{req.secretArns.length - 1} more secrets</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <div>
                            <span className="text-sm text-slate-900">{req.requester?.name}</span>
                            <span className="text-xs text-slate-500 ml-1">({req.requester?.department})</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-400" />
                          <span className="text-sm text-slate-700">{req.durationHours}h requested &middot; {formatDate(req.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{req.justification}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/requests/${req.id}`)}>
                      View Details
                    </Button>
                    {req.status === 'PENDING' && (
                      <>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => {
                            setSelectedId(req.id);
                            setApproveModal(true);
                            setPolicyDiff(null);
                            setDiffLoading(true);
                            requestsApi.policyPreview(req.id)
                              .then(({ data }) => setPolicyDiff(data))
                              .catch(() => toast.error('Failed to load policy preview'))
                              .finally(() => setDiffLoading(false));
                          }}
                          icon={<CheckCircle2 className="h-3 w-3" />}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => { setSelectedId(req.id); setRejectModal(true); }}
                          icon={<XCircle className="h-3 w-3" />}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      <Modal isOpen={approveModal} onClose={() => setApproveModal(false)} title="Approve Request — Policy Preview" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Review the IAM policy diff below. Approving will apply this change.</p>

          {diffLoading && (
            <div className="text-center py-8 text-sm text-slate-500">Loading policy preview...</div>
          )}

          {policyDiff && !diffLoading && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Current Policy</label>
                <pre className="bg-slate-900 text-red-300 rounded-lg p-3 text-xs overflow-auto max-h-64 font-mono leading-relaxed">
                  {policyDiff.current}
                </pre>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Proposed Policy</label>
                <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-xs overflow-auto max-h-64 font-mono leading-relaxed">
                  {policyDiff.proposed}
                </pre>
              </div>
            </div>
          )}

          {!policyDiff && !diffLoading && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-700">Policy preview unavailable. You can still approve — the policy will be applied on confirmation.</p>
            </div>
          )}

          <Input
            label="Override Duration in hours (optional, max 168 = 7 days)"
            type="number"
            min={0.5}
            max={168}
            step={0.5}
            placeholder="Leave empty to use requested duration"
            value={durationOverride}
            onChange={(e) => setDurationOverride(e.target.value)}
            helperText="Approver can extend up to 7 days (168 hours)"
          />
          <Textarea
            label="Approver Notes *"
            value={approveNotes}
            onChange={(e) => setApproveNotes(e.target.value)}
            placeholder="Explain why you are approving this request (min 10 characters)..."
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setApproveModal(false)}>Cancel</Button>
            <Button variant="success" onClick={handleApprove} isLoading={actionLoading} disabled={diffLoading} icon={<CheckCircle2 className="h-3 w-3" />}>
              Confirm Approve & Apply Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={rejectModal} onClose={() => setRejectModal(false)} title="Reject Request">
        <div className="space-y-4">
          <Textarea
            label="Rejection Notes (required)"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Explain the rejection reason..."
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} isLoading={actionLoading}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
