import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';
import { Users, User as UserIcon, Shield, Eye, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AdminUser extends User {
  activeGrants: number;
  isActive: boolean;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    adminApi.users()
      .then(({ data }) => setUsers(Array.isArray(data) ? data : data.data || []))
      .catch((err) => {
        if (err?.response?.status !== 401) {
          toast.error('Failed to load users');
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="mt-1 text-sm text-slate-500">{users.length} registered users</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">All Users</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Grants</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full',
                          u.role === 'APPROVER' ? 'bg-emerald-100 text-emerald-700' :
                          u.role === 'AUDITOR' ? 'bg-purple-100 text-purple-700' :
                          'bg-primary-100 text-primary-700',
                        )}>
                          {u.role === 'APPROVER' ? <Shield className="h-4 w-4" /> :
                           u.role === 'AUDITOR' ? <Eye className="h-4 w-4" /> :
                           <UserIcon className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{u.name}</p>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Mail className="h-3 w-3" />
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles && u.roles.length > 0 ? u.roles : [u.role]).map((r) => (
                          <Badge key={r} className={cn(
                            r === 'APPROVER' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                            r === 'AUDITOR' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                            'bg-primary-100 text-primary-800 border-primary-200',
                          )}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{u.department || '—'}</td>
                    <td className="px-6 py-4 text-center">
                      {u.activeGrants > 0 ? (
                        <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700">
                          {u.activeGrants}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', u.isActive ? 'bg-emerald-500' : 'bg-red-500')} />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
