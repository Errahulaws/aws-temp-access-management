import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireRole } from '@/components/RequireRole';
import { LoginPage } from '@/pages/LoginPage';
import { SsoCallbackPage } from '@/pages/SsoCallbackPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NewRequestPage } from '@/pages/NewRequestPage';
import { RequestsListPage } from '@/pages/RequestsListPage';
import { RequestDetailPage } from '@/pages/RequestDetailPage';
import { AdminQueuePage } from '@/pages/AdminQueuePage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AuditPage } from '@/pages/AuditPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SlackSettingsPage } from '@/pages/SlackSettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/sso/callback" element={<SsoCallbackPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/requests/new" element={<NewRequestPage />} />
              <Route path="/requests/:id" element={<RequestDetailPage />} />
              <Route path="/requests" element={<RequestsListPage />} />
              <Route path="/admin/requests" element={<RequireRole roles={['APPROVER']}><AdminQueuePage /></RequireRole>} />
              <Route path="/admin/users" element={<RequireRole roles={['APPROVER']}><AdminUsersPage /></RequireRole>} />
              <Route path="/audit" element={<RequireRole roles={['APPROVER', 'AUDITOR']}><AuditPage /></RequireRole>} />
              <Route path="/admin/slack" element={<RequireRole roles={['APPROVER']}><SlackSettingsPage /></RequireRole>} />
              <Route path="/settings" element={<RequireRole roles={['APPROVER', 'AUDITOR']}><SettingsPage /></RequireRole>} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '12px',
                background: '#1e293b',
                color: '#fff',
                fontSize: '14px',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
