import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { User, Mail, Calendar, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account settings and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Profile Information</h3>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold',
              user.role === 'APPROVER' ? 'bg-emerald-100 text-emerald-700' :
              user.role === 'AUDITOR' ? 'bg-purple-100 text-purple-700' :
              'bg-primary-100 text-primary-700',
            )}>
              {user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
              <Badge className={cn(
                user.role === 'APPROVER' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                user.role === 'AUDITOR' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                'bg-primary-100 text-primary-800 border-primary-200',
              )}>
                {user.role}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Member since" value={user.createdAt ? formatDate(user.createdAt) : '—'} />
            <InfoRow icon={<KeyRound className="h-4 w-4" />} label="Active Grants" value={String(user.activeGrants ?? 0)} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Last Login" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Security</h3>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm font-medium text-blue-800">SSO Authentication</p>
            <p className="text-xs text-blue-700 mt-1">
              In production, authentication is managed through your organization's SSO provider. MFA enrollment are handled through the IdP.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
      <div className="text-slate-400">{icon}</div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-900">{value}</p>
      </div>
    </div>
  );
}
