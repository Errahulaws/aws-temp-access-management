import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestsApi, accountsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/Card';
import { ArrowLeft, ArrowRight, Plus, X, Shield, AlertTriangle, CheckCircle2, Key, Users, Globe, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const AVAILABLE_ACTIONS = [
  { value: 'secretsmanager:GetSecretValue', label: 'GetSecretValue', desc: 'Retrieve the encrypted secret value' },
  { value: 'secretsmanager:DescribeSecret', label: 'DescribeSecret', desc: 'Get secret metadata (no value)' },
  { value: 'secretsmanager:ListSecretVersionIds', label: 'ListSecretVersionIds', desc: 'List all version IDs' },
  { value: 'secretsmanager:UpdateSecret', label: 'UpdateSecret', desc: 'Update secret value or metadata' },
  { value: 'secretsmanager:PutSecretValue', label: 'PutSecretValue', desc: 'Store a new secret value version' },
  { value: 'secretsmanager:CreateSecret', label: 'CreateSecret', desc: 'Create a new secret' },
  { value: 'secretsmanager:TagResource', label: 'TagResource', desc: 'Add tags to a secret' },
];

const STEPS = ['Team & Role', 'Secret Details', 'Access Scope', 'Justification', 'Review'];

interface AccountOption {
  id: string;
  accountId: string;
  label: string;
}

interface TeamOption {
  id: string;
  label: string;
}

interface RoleLevelOption {
  id: string;
  label: string;
}

export function NewRequestPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [roleLevels, setRoleLevels] = useState<RoleLevelOption[]>([]);

  const [form, setForm] = useState({
    targetAccountId: '' as string,
    team: '',
    roleLevel: '',
    accessScope: 'specific' as 'specific' | 'all',
    secretArns: [''],
    actionsRequested: ['secretsmanager:GetSecretValue'] as string[],
    environment: 'prod',
    durationHours: 4,
    justification: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    accountsApi.list().then(({ data }) => setAccounts(data.accounts)).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.targetAccountId) {
      accountsApi.getTeams(form.targetAccountId)
        .then(({ data }) => setTeams(data.teams))
        .catch(() => setTeams([]));
    } else {
      setTeams([]);
    }
  }, [form.targetAccountId]);

  useEffect(() => {
    if (form.team && form.targetAccountId) {
      accountsApi.getRoleLevels(form.targetAccountId, form.team)
        .then(({ data }) => setRoleLevels(data.roleLevels))
        .catch(() => setRoleLevels([]));
    } else {
      setRoleLevels([]);
    }
  }, [form.team, form.targetAccountId]);

  const update = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const addArn = () => {
    if (form.secretArns.length < 10) {
      update('secretArns', [...form.secretArns, '']);
    }
  };

  const removeArn = (idx: number) => {
    update('secretArns', form.secretArns.filter((_, i) => i !== idx));
  };

  const updateArn = (idx: number, val: string) => {
    const arns = [...form.secretArns];
    arns[idx] = val;
    update('secretArns', arns);
  };

  const toggleAction = (action: string) => {
    const actions = form.actionsRequested.includes(action)
      ? form.actionsRequested.filter((a) => a !== action)
      : [...form.actionsRequested, action];
    if (actions.length > 0) update('actionsRequested', actions);
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};

    if (step === 0) {
      if (!form.targetAccountId) newErrors.targetAccountId = 'Please select a target account';
      if (!form.team) newErrors.team = 'Please select a team';
      if (!form.roleLevel) newErrors.roleLevel = 'Please select a role level';
    }

    if (step === 1) {
      if (form.accessScope === 'specific') {
        const arnRegex = /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/;
        const filteredArns = form.secretArns.filter((a) => a.trim());
        if (filteredArns.length === 0) newErrors.secretArns = 'At least one secret ARN is required';
        else {
          filteredArns.forEach((arn, i) => {
            if (!arnRegex.test(arn)) newErrors[`arn_${i}`] = 'Invalid ARN format';
          });
        }
      }
    }

    if (step === 2) {
      if (form.actionsRequested.length === 0) newErrors.actionsRequested = 'Select at least one action';
      if (form.durationHours < 0.5 || (form.durationHours > 8 && form.durationHours !== 9)) newErrors.durationHours = 'Please select a valid duration';
    }

    if (step === 3) {
      if (form.justification.length < 30) newErrors.justification = 'Justification must be at least 30 characters';
      if (form.justification.length > 2000) newErrors.justification = 'Justification must not exceed 2000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep()) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    try {
      const secretArns = form.accessScope === 'all'
        ? ['*']
        : form.secretArns.filter((a) => a.trim());

      const payload: Parameters<typeof requestsApi.create>[0] = {
        targetAccountId: form.targetAccountId,
        team: form.team,
        roleLevel: form.roleLevel,
        accessScope: form.accessScope,
        secretArns,
        actionsRequested: form.actionsRequested,
        environment: form.environment,
        durationHours: form.durationHours === 9 ? 8 : form.durationHours,
        justification: form.justification,
      };
      const { data } = await requestsApi.create(payload);
      toast.success('Access request submitted successfully!');
      navigate(`/requests/${data.id}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccountLabel = accounts.find((a) => a.accountId === form.targetAccountId)?.label || form.targetAccountId || '';
  const selectedTeamLabel = teams.find((t) => t.id === form.team)?.label || '';
  const selectedRoleLevelLabel = roleLevels.find((r) => r.id === form.roleLevel)?.label || '';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Access Request</h1>
        <p className="mt-1 text-sm text-slate-500">Request time-bounded access to AWS Secrets Manager resources</p>
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    i < step ? 'bg-primary-600 text-white' :
                    i === step ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-600' :
                    'bg-slate-100 text-slate-400',
                  )}
                >
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn(
                  'text-sm font-medium hidden sm:block',
                  i <= step ? 'text-slate-900' : 'text-slate-400',
                )}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('mx-3 h-0.5 w-8 md:w-14', i < step ? 'bg-primary-600' : 'bg-slate-200')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-slate-900">{STEPS[step]}</h2>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Target Account</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {accounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => { update('targetAccountId', account.accountId); update('team', ''); update('roleLevel', ''); }}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-4 transition-all text-left',
                          form.targetAccountId === account.accountId
                            ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <Globe className={cn('h-5 w-5', form.targetAccountId === account.accountId ? 'text-primary-600' : 'text-slate-400')} />
                        <div>
                          <span className={cn('text-sm font-medium block', form.targetAccountId === account.accountId ? 'text-primary-700' : 'text-slate-700')}>
                            {account.label}
                          </span>
                          <span className="text-xs text-slate-500">{account.accountId}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {accounts.length === 0 && (
                    <p className="text-sm text-slate-500 italic">No accounts configured. Contact your administrator.</p>
                  )}
                  {errors.targetAccountId && <p className="text-xs text-danger-600 mt-1">{errors.targetAccountId}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Team</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => { update('team', team.id); update('roleLevel', ''); }}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-4 transition-all text-left',
                          form.team === team.id
                            ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <Users className={cn('h-5 w-5', form.team === team.id ? 'text-primary-600' : 'text-slate-400')} />
                        <span className={cn('text-sm font-medium', form.team === team.id ? 'text-primary-700' : 'text-slate-700')}>
                          {team.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {teams.length === 0 && (
                    <p className="text-sm text-slate-500 italic">No teams configured. Contact your administrator.</p>
                  )}
                  {errors.team && <p className="text-xs text-danger-600 mt-1">{errors.team}</p>}
                </div>

                {form.team && roleLevels.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Role Level</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {roleLevels.map((rl) => (
                        <button
                          key={rl.id}
                          type="button"
                          onClick={() => update('roleLevel', rl.id)}
                          className={cn(
                            'rounded-lg border p-3 transition-all text-center',
                            form.roleLevel === rl.id
                              ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                          )}
                        >
                          <span className={cn('text-sm font-medium', form.roleLevel === rl.id ? 'text-primary-700' : 'text-slate-700')}>
                            {rl.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    {errors.roleLevel && <p className="text-xs text-danger-600 mt-1">{errors.roleLevel}</p>}
                  </div>
                )}

                {form.team && roleLevels.length === 0 && (
                  <p className="text-sm text-amber-600">No role levels configured for this team.</p>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Access Scope</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => update('accessScope', 'specific')}
                      className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        form.accessScope === 'specific'
                          ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <p className={cn('text-sm font-medium', form.accessScope === 'specific' ? 'text-primary-700' : 'text-slate-700')}>
                        Specific Secrets
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Provide individual secret ARNs</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => update('accessScope', 'all')}
                      className={cn(
                        'rounded-lg border p-4 text-left transition-all',
                        form.accessScope === 'all'
                          ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <p className={cn('text-sm font-medium', form.accessScope === 'all' ? 'text-amber-700' : 'text-slate-700')}>
                        All Secrets in Account
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Requires dual approval (2 approvers)</p>
                    </button>
                  </div>
                </div>

                {form.accessScope === 'all' && (
                  <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Dual Approval Required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Requesting access to all secrets in an account requires approval from 2 different approvers before the policy is applied.
                      </p>
                    </div>
                  </div>
                )}

                {form.accessScope === 'specific' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">Secret ARN(s)</label>
                    {form.secretArns.map((arn, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={arn}
                          onChange={(e) => updateArn(i, e.target.value)}
                          placeholder="arn:aws:secretsmanager:us-west-2:123456789012:secret:path/to/secret"
                          error={errors[`arn_${i}`]}
                          className="flex-1 font-mono text-xs"
                        />
                        {form.secretArns.length > 1 && (
                          <button onClick={() => removeArn(i)} className="text-slate-400 hover:text-red-500 transition-colors">
                            <X className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {errors.secretArns && <p className="text-xs text-danger-600">{errors.secretArns}</p>}
                    {form.secretArns.length < 10 && (
                      <Button variant="outline" size="sm" onClick={addArn} icon={<Plus className="h-3 w-3" />}>
                        Add Another ARN
                      </Button>
                    )}
                    <p className="text-xs text-slate-500">Maximum 10 ARNs per request</p>
                  </div>
                )}

              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Requested Actions</label>
                <div className="space-y-2">
                  {AVAILABLE_ACTIONS.map(({ value, label, desc }) => (
                    <label
                      key={value}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-all',
                        form.actionsRequested.includes(value)
                          ? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={form.actionsRequested.includes(value)}
                        onChange={() => toggleAction(value)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{label}</p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {errors.actionsRequested && <p className="text-xs text-danger-600">{errors.actionsRequested}</p>}
              </div>

              <div>
                <Select
                  id="durationHours"
                  label="Access Duration"
                  value={String(form.durationHours)}
                  onChange={(e) => update('durationHours', parseFloat(e.target.value))}
                  options={[
                    { value: '0.5', label: '30 minutes' },
                    { value: '1', label: '1 hour' },
                    { value: '2', label: '2 hours' },
                    { value: '4', label: '4 hours' },
                    { value: '6', label: '6 hours' },
                    { value: '8', label: '8 hours' },
                    { value: '9', label: 'More than 8 hours (specify in justification)' },
                  ]}
                  error={errors.durationHours}
                />
                {form.durationHours === 9 && (
                  <div className="flex items-start gap-2 mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      Please specify the exact duration you need and why in your justification. The approver can grant up to 7 days. If the approver does not override, access will default to 8 hours.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <Textarea
              id="justification"
              label="Business Justification"
              value={form.justification}
              onChange={(e) => update('justification', e.target.value)}
              placeholder="Explain why you need access to these secrets. Include relevant ticket numbers, incident IDs, or project references..."
              error={errors.justification}
              helperText={`${form.justification.length}/2000 characters (minimum 30)`}
              rows={6}
            />
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200">
                <ReviewRow label="Target Account">
                  <span className="text-sm font-medium text-slate-900">
                    {selectedAccountLabel}
                  </span>
                </ReviewRow>
                <ReviewRow label="Team">{selectedTeamLabel}</ReviewRow>
                <ReviewRow label="Role Level">{selectedRoleLevelLabel}</ReviewRow>
                <ReviewRow label="Access Scope">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold uppercase', {
                    'bg-primary-100 text-primary-800': form.accessScope === 'specific',
                    'bg-amber-100 text-amber-800': form.accessScope === 'all',
                  })}>
                    {form.accessScope === 'all' ? 'All Secrets (Dual Approval)' : 'Specific Secrets'}
                  </span>
                </ReviewRow>
                {form.accessScope === 'specific' && (
                  <ReviewRow label="Secret ARN(s)">
                    <div className="space-y-1">
                      {form.secretArns.filter((a) => a.trim()).map((arn, i) => (
                        <p key={i} className="text-sm font-mono text-slate-900 break-all">{arn}</p>
                      ))}
                    </div>
                  </ReviewRow>
                )}
                {form.accessScope === 'all' && (
                  <ReviewRow label="Resource">
                    <p className="text-sm font-mono text-slate-900">* (All secrets)</p>
                  </ReviewRow>
                )}
                <ReviewRow label="Actions">
                  <div className="flex flex-wrap gap-1">
                    {form.actionsRequested.map((a) => (
                      <span key={a} className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                        {a.split(':')[1]}
                      </span>
                    ))}
                  </div>
                </ReviewRow>
                <ReviewRow label="Duration">
                  {form.durationHours === 9
                    ? '8 hours (default) — extended duration requested in justification'
                    : form.durationHours >= 1
                      ? `${form.durationHours} hour${form.durationHours > 1 ? 's' : ''}`
                      : '30 minutes'}
                </ReviewRow>
                <ReviewRow label="Justification">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{form.justification}</p>
                </ReviewRow>
              </div>

              {form.accessScope === 'all' && (
                <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Dual Approval Required</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      This request needs 2 different approvers. The IAM policy will only be applied after both approve.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-4">
                <Shield className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">What happens next?</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {form.accessScope === 'all'
                      ? 'Your request will be reviewed by 2 Approvers. Once both approve, an IAM policy statement will be appended granting time-bounded access to all secrets. Access is automatically revoked after the specified duration.'
                      : 'Your request will be reviewed by an Approver. Upon approval, an IAM policy statement will be appended to your team\'s managed policy granting time-bounded access. Access is automatically revoked after the specified duration.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={prevStep} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={nextStep}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} isLoading={isSubmitting} icon={<Key className="h-4 w-4" />}>
              Submit Request
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <span className="text-sm font-medium text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
