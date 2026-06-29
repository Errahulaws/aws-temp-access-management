import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  MessageSquare,
  Save,
  TestTube2,
  CheckCircle2,
  XCircle,
  Bell,
  Loader2,
  ShieldAlert,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface SlackSettings {
  slackEnabled: boolean;
  slackWebhookUrl: string | null;
  slackWebhookConfigured: boolean;
  slackChannel: string | null;
  slackNotifyOnCreate: boolean;
  slackNotifyOnApprove: boolean;
  slackNotifyOnReject: boolean;
  slackNotifyOnRevoke: boolean;
  updatedAt: string;
}

export function SlackSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SlackSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [form, setForm] = useState({
    slackEnabled: false,
    slackWebhookUrl: '',
    slackChannel: '',
    slackNotifyOnCreate: true,
    slackNotifyOnApprove: true,
    slackNotifyOnReject: true,
    slackNotifyOnRevoke: true,
  });

  const [webhookChanged, setWebhookChanged] = useState(false);

  useEffect(() => {
    settingsApi.get()
      .then(({ data }) => {
        setSettings(data);
        setForm({
          slackEnabled: data.slackEnabled,
          slackWebhookUrl: data.slackWebhookUrl ?? '',
          slackChannel: data.slackChannel ?? '',
          slackNotifyOnCreate: data.slackNotifyOnCreate,
          slackNotifyOnApprove: data.slackNotifyOnApprove,
          slackNotifyOnReject: data.slackNotifyOnReject,
          slackNotifyOnRevoke: data.slackNotifyOnRevoke,
        });
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setTestResult(null);
    try {
      const payload = {
        ...form,
        slackWebhookUrl: webhookChanged ? form.slackWebhookUrl : (settings?.slackWebhookUrl ?? ''),
      };
      const { data } = await settingsApi.update(payload);
      setSettings(data);
      setWebhookChanged(false);
      toast.success('Slack settings saved successfully');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const payload: { webhookUrl?: string; channel?: string } = {};
      if (webhookChanged && form.slackWebhookUrl) {
        payload.webhookUrl = form.slackWebhookUrl;
      }
      if (form.slackChannel) payload.channel = form.slackChannel;

      const { data } = await settingsApi.testSlack(payload);
      setTestResult(data);
      if (data.ok) {
        toast.success('Test message sent to Slack!');
      } else {
        toast.error(data.error || 'Test failed');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setTestResult({ ok: false, error: error.response?.data?.error || 'Test failed' });
      toast.error('Failed to send test message');
    } finally {
      setIsTesting(false);
    }
  };

  const updateForm = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-96 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A154B] text-white">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Slack Notifications</h1>
            <p className="text-sm text-slate-500">Configure Slack webhook to receive request notifications</p>
          </div>
        </div>
      </div>

      {/* Master Toggle */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                form.slackEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400',
              )}>
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Enable Slack Notifications</p>
                <p className="text-xs text-slate-500">
                  {form.slackEnabled
                    ? 'Notifications are active — events will be posted to Slack'
                    : 'Notifications are paused — no messages will be sent'}
                </p>
              </div>
            </div>
            <button
              onClick={() => updateForm('slackEnabled', !form.slackEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
                form.slackEnabled ? 'bg-emerald-500' : 'bg-slate-300',
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                form.slackEnabled ? 'translate-x-6' : 'translate-x-1',
              )} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card className={cn(!form.slackEnabled && 'opacity-60 pointer-events-none')}>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Webhook Configuration</h3>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Input
              id="webhookUrl"
              label="Slack Webhook URL"
              type="url"
              value={form.slackWebhookUrl}
              onChange={(e) => {
                updateForm('slackWebhookUrl', e.target.value);
                setWebhookChanged(true);
              }}
              placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXX"
              helperText={
                settings?.slackWebhookConfigured && !webhookChanged
                  ? 'Webhook is configured (masked for security). Enter a new URL to replace it.'
                  : 'Paste your Slack Incoming Webhook URL. Go to api.slack.com/apps to create one.'
              }
            />
          </div>

          <Input
            id="channel"
            label="Channel Override (optional)"
            value={form.slackChannel}
            onChange={(e) => updateForm('slackChannel', e.target.value)}
            placeholder="#security-alerts"
            helperText="Leave blank to use the webhook's default channel"
          />

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              isLoading={isTesting}
              disabled={!settings?.slackWebhookConfigured && !webhookChanged}
              icon={<TestTube2 className="h-4 w-4" />}
            >
              Send Test Message
            </Button>
            {testResult && (
              <div className={cn(
                'flex items-center gap-1.5 text-sm font-medium',
                testResult.ok ? 'text-emerald-600' : 'text-red-600',
              )}>
                {testResult.ok
                  ? <><CheckCircle2 className="h-4 w-4" /> Connected successfully</>
                  : <><XCircle className="h-4 w-4" /> {testResult.error}</>
                }
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Events */}
      <Card className={cn(!form.slackEnabled && 'opacity-60 pointer-events-none')}>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Notification Events</h3>
          <p className="text-xs text-slate-500 mt-0.5">Choose which events trigger a Slack notification</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            <NotificationToggle
              title="New Request Submitted"
              description="When a user submits a new access request"
              emoji=":inbox_tray:"
              enabled={form.slackNotifyOnCreate}
              onChange={(v) => updateForm('slackNotifyOnCreate', v)}
              color="blue"
            />
            <NotificationToggle
              title="Request Approved"
              description="When an admin approves and IAM policy is applied"
              emoji=":white_check_mark:"
              enabled={form.slackNotifyOnApprove}
              onChange={(v) => updateForm('slackNotifyOnApprove', v)}
              color="emerald"
            />
            <NotificationToggle
              title="Request Rejected"
              description="When an admin rejects an access request"
              emoji=":x:"
              enabled={form.slackNotifyOnReject}
              onChange={(v) => updateForm('slackNotifyOnReject', v)}
              color="red"
            />
            <NotificationToggle
              title="Access Revoked"
              description="When active access is manually revoked"
              emoji=":rotating_light:"
              enabled={form.slackNotifyOnRevoke}
              onChange={(v) => updateForm('slackNotifyOnRevoke', v)}
              color="purple"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleSave} isLoading={isSaving} icon={<Save className="h-4 w-4" />}>
            Save Settings
          </Button>
        </CardFooter>
      </Card>

      {/* Security Note */}
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Security Note</p>
          <p className="text-xs text-amber-700 mt-0.5">
            The webhook URL is stored encrypted at rest and masked in the UI after saving. Only Approver-role users can view or change these settings. All changes are recorded in the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle({
  title,
  description,
  enabled,
  onChange,
  color,
}: {
  title: string;
  description: string;
  emoji?: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  color: 'blue' | 'emerald' | 'red' | 'purple';
}) {
  const colorMap = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', colorMap[color])}>
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          enabled ? 'bg-emerald-500' : 'bg-slate-300',
        )}
      >
        <span className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform',
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]',
        )} />
      </button>
    </div>
  );
}
