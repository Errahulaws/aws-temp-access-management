import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { requestsApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StatusBadge, AccountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { AccessRequest } from '@/types';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Shield,
  Clock,
  User,
  FileKey,
  Activity,
  Ban,
  Code,
  Timer,
  FilePlus2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState<AccessRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [approveModal, setApproveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [revokeModal, setRevokeModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);

  const [approveForm, setApproveForm] = useState({ durationOverride: '', notes: '' });
  const [rejectNotes, setRejectNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [policyDiff, setPolicyDiff] = useState<{ current: string; proposed: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    requestsApi.getById(id)
      .then(({ data }) => setRequest(data))
      .catch(() => toast.error('Failed to load request'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const openApproveModal = async () => {
    setApproveModal(true);
    setPolicyDiff(null);
    setDiffLoading(true);
    try {
      const { data } = await requestsApi.policyPreview(id!);
      setPolicyDiff(data);
    } catch {
      toast.error('Failed to load policy preview');
    } finally {
      setDiffLoading(false);
    }
  };

  const openRevokeModal = async () => {
    setRevokeModal(true);
    setPolicyDiff(null);
    setDiffLoading(true);
    try {
      const { data } = await requestsApi.revokePreview(id!);
      setPolicyDiff(data);
    } catch {
      toast.error('Failed to load revoke preview');
    } finally {
      setDiffLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    if (approveForm.notes.trim().length < 10) {
      toast.error('Approver notes are required (at least 10 characters)');
      return;
    }
    setActionLoading(true);
    try {
      const payload: { durationHoursOverride?: number; approverNotes: string } = {
        approverNotes: approveForm.notes.trim(),
      };
      if (approveForm.durationOverride) payload.durationHoursOverride = parseInt(approveForm.durationOverride);
      const { data } = await requestsApi.approve(id, payload);
      setRequest(data);
      setApproveModal(false);
      toast.success('Request approved and policy applied!');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    if (rejectNotes.length < 10) {
      toast.error('Rejection notes must be at least 10 characters');
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await requestsApi.reject(id, { rejectionNotes: rejectNotes });
      setRequest(data);
      setRejectModal(false);
      toast.success('Request rejected');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Rejection failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const { data } = await requestsApi.revoke(id);
      setRequest(data);
      setRevokeModal(false);
      toast.success('Access revoked and policy removed');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Revocation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const { data } = await requestsApi.cancel(id);
      setRequest(data);
      setCancelModal(false);
      toast.success('Request cancelled');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!request) {
    return <div className="text-center py-12 text-slate-500">Request not found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">Request Details</h1>
              <StatusBadge status={request.status} />
            </div>
            <p className="text-sm text-slate-500 font-mono">ID: {request.id}</p>
          </div>
          {user?.role === 'APPROVER' && (
            <div className="flex gap-2">
              {request.status === 'PENDING' && (
                <>
                  {request.requesterId === user.id ? (
                    <span className="text-sm text-amber-600 font-medium self-center">Cannot approve own request</span>
                  ) : !(request.approvals || []).some((a) => a.approverId === user.id) ? (
                    <Button variant="success" onClick={openApproveModal} icon={<CheckCircle2 className="h-4 w-4" />}>
                      Approve {(request.approvalsRequired || 1) > 1 ? `(${(request.approvals || []).length + 1}/${request.approvalsRequired})` : ''}
                    </Button>
                  ) : (
                    <span className="text-sm text-emerald-600 font-medium self-center">You already approved</span>
                  )}
                  {request.requesterId !== user.id && (
                    <Button variant="danger" onClick={() => setRejectModal(true)} icon={<XCircle className="h-4 w-4" />}>
                      Reject
                    </Button>
                  )}
                </>
              )}
              {request.status === 'ACTIVE' && (
                <Button variant="danger" onClick={openRevokeModal} icon={<Ban className="h-4 w-4" />}>
                  Revoke Access
                </Button>
              )}
            </div>
          )}
          {request.requesterId === user?.id && request.status === 'PENDING' && (
            <Button variant="outline" onClick={() => setCancelModal(true)} icon={<XCircle className="h-4 w-4" />}>
              Cancel Request
            </Button>
          )}
        </div>
      </div>

      {/* Request Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileKey className="h-5 w-5 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-900">Secret Resources</h3>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Secret ARNs</label>
                <div className="mt-1 space-y-1">
                  {request.secretArns.map((arn, i) => (
                    <p key={i} className="text-sm font-mono text-slate-800 bg-slate-50 rounded px-3 py-2 break-all">{arn}</p>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Requested Actions</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {request.actionsRequested.map((action) => (
                    <span key={action} className="rounded-full bg-primary-50 border border-primary-200 px-3 py-1 text-xs font-medium text-primary-700">
                      {action}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Justification</label>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded p-3">{request.justification}</p>
              </div>
              {request.rejectionNotes && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <p className="text-sm font-medium text-red-800">Rejection Reason</p>
                  <p className="text-sm text-red-700 mt-1">{request.rejectionNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Policy Document */}
          {request.policyDocument && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Generated IAM Policy</h3>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">
                  {JSON.stringify(request.policyDocument, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Audit Timeline */}
          {request.auditLogs && request.auditLogs.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Audit Timeline</h3>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {request.auditLogs.map((log, i) => (
                    <div key={log.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
                          {
                            'bg-blue-100': log.eventType === 'REQUEST_CREATED',
                            'bg-emerald-100': log.eventType === 'REQUEST_APPROVED' || log.eventType === 'POLICY_APPLIED',
                            'bg-red-100': log.eventType === 'REQUEST_REJECTED',
                            'bg-purple-100': log.eventType === 'POLICY_REVOKED',
                            'bg-slate-100': !['REQUEST_CREATED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'POLICY_APPLIED', 'POLICY_REVOKED'].includes(log.eventType),
                          },
                        )}>
                          <TimelineIcon eventType={log.eventType} />
                        </div>
                        {i < request.auditLogs!.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-medium text-slate-900">{formatEventLabel(log.eventType)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {log.actor?.name ?? 'System'} &middot; {formatDate(log.eventTime)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Account</label>
                <div className="mt-1"><AccountBadge label={request.accountLabel} /></div>
              </div>
              {(request.approvalsRequired || 1) > 1 && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Approval Progress</label>
                  <div className="mt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${((request.approvals || []).length / (request.approvalsRequired || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">
                        {(request.approvals || []).length}/{request.approvalsRequired}
                      </span>
                    </div>
                    {(request.approvals || []).map((a, i) => (
                      <div key={i} className="flex items-center gap-2 mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-xs text-slate-600">{a.approverName}</span>
                      </div>
                    ))}
                    {request.status === 'PENDING' && (request.approvals || []).length < (request.approvalsRequired || 1) && (
                      <p className="text-xs text-amber-600 mt-1">
                        Waiting for {(request.approvalsRequired || 1) - (request.approvals || []).length} more approval(s)
                      </p>
                    )}
                  </div>
                </div>
              )}
              {request.targetAccountId && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Target Account</label>
                  <div className="mt-1">
                    <span className="text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                      {request.targetAccountId}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</label>
                <div className="mt-1 flex items-center gap-2">
                  <Timer className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-900">
                    {request.durationHours >= 1 ? `${request.durationHours} hours` : `${request.durationHours * 60} minutes`}
                  </span>
                </div>
              </div>
              {request.expiresAt && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Expires At</label>
                  <p className="mt-1 text-sm text-slate-900">{formatDate(request.expiresAt)}</p>
                  {request.status === 'ACTIVE' && (
                    <p className="text-xs text-emerald-600 font-medium">{formatRelativeTime(request.expiresAt)}</p>
                  )}
                </div>
              )}
              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Requester</label>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{request.requester.name}</p>
                    <p className="text-xs text-slate-500">{request.requester.email}</p>
                  </div>
                </div>
              </div>
              {request.approver && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Approver</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{request.approver.name}</p>
                      <p className="text-xs text-slate-500">{request.approver.email}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Created</label>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {formatDate(request.createdAt)}
                </div>
              </div>
              {request.policyStatementId && (
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Policy Sid</label>
                  <p className="mt-1 text-xs font-mono text-slate-700 bg-slate-50 rounded px-2 py-1">{request.policyStatementId}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve Modal */}
      <Modal isOpen={approveModal} onClose={() => setApproveModal(false)} title="Approve Request — Policy Preview" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Review the IAM policy diff below. Approving will apply this change.
          </p>

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

          <Input
            label="Override Duration in hours (optional, max 168 = 7 days)"
            type="number"
            min={0.5}
            max={168}
            step={0.5}
            placeholder={`${request.durationHours >= 1 ? request.durationHours + ' hours' : '30 minutes'} (requested)`}
            value={approveForm.durationOverride}
            onChange={(e) => setApproveForm((f) => ({ ...f, durationOverride: e.target.value }))}
            helperText="Approver can extend up to 7 days (168 hours)"
          />
          <Textarea
            label="Approver Notes *"
            value={approveForm.notes}
            onChange={(e) => setApproveForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Explain why you are approving this request (min 10 characters)..."
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setApproveModal(false)}>Cancel</Button>
            <Button variant="success" onClick={handleApprove} isLoading={actionLoading} disabled={diffLoading} icon={<CheckCircle2 className="h-4 w-4" />}>
              Confirm Approve & Apply Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={rejectModal} onClose={() => setRejectModal(false)} title="Reject Request" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Please provide a reason for rejection. This will be visible to the requester.</p>
          <Textarea
            label="Rejection Notes"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Explain why this request is being rejected..."
            rows={4}
            helperText="Minimum 10 characters"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRejectModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} isLoading={actionLoading} icon={<XCircle className="h-4 w-4" />}>
              Reject Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Modal */}
      <Modal isOpen={revokeModal} onClose={() => setRevokeModal(false)} title="Revoke Access — Policy Preview" size="lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm font-medium text-red-800">Warning: This action cannot be undone</p>
            <p className="text-sm text-red-700 mt-1">
              Revoking will immediately remove the IAM policy statement granting access. Review the diff below to confirm.
            </p>
          </div>

          {diffLoading && (
            <div className="text-center py-8 text-sm text-slate-500">Loading revoke preview...</div>
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
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">After Revocation</label>
                <pre className="bg-slate-900 text-green-300 rounded-lg p-3 text-xs overflow-auto max-h-64 font-mono leading-relaxed">
                  {policyDiff.proposed}
                </pre>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRevokeModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleRevoke} isLoading={actionLoading} disabled={diffLoading} icon={<Ban className="h-4 w-4" />}>
              Confirm Revoke Access
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal isOpen={cancelModal} onClose={() => setCancelModal(false)} title="Cancel Request" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to cancel this request? This action will withdraw your access request and it will no longer be reviewed by approvers.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCancelModal(false)}>Keep Request</Button>
            <Button variant="danger" onClick={handleCancel} isLoading={actionLoading} icon={<XCircle className="h-4 w-4" />}>
              Cancel Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function formatEventLabel(type: string) {
  const labels: Record<string, string> = {
    REQUEST_CREATED: 'Request Created',
    REQUEST_APPROVED: 'Request Approved',
    REQUEST_REJECTED: 'Request Rejected',
    REQUEST_CANCELLED: 'Request Cancelled',
    POLICY_APPLIED: 'IAM Policy Applied',
    POLICY_REVOKED: 'IAM Policy Revoked',
    REVOCATION_FAILED: 'Revocation Failed',
  };
  return labels[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function TimelineIcon({ eventType }: { eventType: string }) {
  switch (eventType) {
    case 'REQUEST_CREATED': return <FilePlus2 className="h-4 w-4 text-blue-600" />;
    case 'REQUEST_APPROVED': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'REQUEST_REJECTED': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'POLICY_APPLIED': return <Shield className="h-4 w-4 text-emerald-600" />;
    case 'POLICY_REVOKED': return <Shield className="h-4 w-4 text-purple-600" />;
    default: return <Activity className="h-4 w-4 text-slate-400" />;
  }
}
