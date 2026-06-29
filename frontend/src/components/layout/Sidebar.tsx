import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FilePlus2,
  FileText,
  ShieldCheck,
  Users,
  ScrollText,
  Settings,
  LogOut,
  KeyRound,
  ChevronLeft,
  MessageSquare,
  ArrowRightLeft,
} from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@/types';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['REQUESTER', 'APPROVER', 'AUDITOR'] },
  { path: '/requests/new', label: 'New Request', icon: FilePlus2, roles: ['REQUESTER'] },
  { path: '/requests', label: 'My Requests', icon: FileText, roles: ['REQUESTER'] },
  { path: '/admin/requests', label: 'Approval Queue', icon: ShieldCheck, roles: ['APPROVER'] },
  { path: '/admin/users', label: 'User Management', icon: Users, roles: ['APPROVER'] },
  { path: '/audit', label: 'Audit Log', icon: ScrollText, roles: ['APPROVER', 'AUDITOR'] },
  { path: '/admin/slack', label: 'Slack Notifications', icon: MessageSquare, roles: ['APPROVER'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['APPROVER', 'AUDITOR'] },
];

export function Sidebar() {
  const { user, logout, switchRole, canSwitchRole } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [switching, setSwitching] = useState(false);

  const filteredNav = navItems.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shrink-0">
          <KeyRound className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-slate-900 leading-tight">IAM Access</h1>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Governance Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {filteredNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary-50 text-primary-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="border-t border-slate-100 p-3 space-y-3">
        {!collapsed && user && (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <span className="mt-1.5 inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-[10px] font-bold text-primary-700 uppercase tracking-wider">
              {user.role}
            </span>
          </div>
        )}

        {!collapsed && canSwitchRole && user && (
          <div className="px-1">
            <div className="flex items-center gap-2 mb-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Switch Role</span>
            </div>
            {user.roles
              .filter((r) => r !== user.role)
              .map((r) => (
                <button
                  key={r}
                  disabled={switching}
                  onClick={async () => {
                    setSwitching(true);
                    try {
                      await switchRole(r);
                      navigate('/dashboard');
                    } finally {
                      setSwitching(false);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 text-left hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-colors disabled:opacity-50"
                >
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </button>
              ))}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>
    </aside>
  );
}
