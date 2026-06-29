import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

export function SsoCallbackPage() {
  const [searchParams] = useSearchParams();
  const { handleSSOCallback } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');

    // Immediately clear tokens from URL to prevent history/referrer leakage
    window.history.replaceState({}, '', '/sso/callback');

    if (token) {
      handleSSOCallback(token, refreshToken || undefined)
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          navigate('/login?error=sso_failed', { replace: true });
        });
    } else {
      navigate('/login?error=no_token', { replace: true });
    }
  }, [searchParams, handleSSOCallback, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <p className="text-sm text-slate-500">Completing sign in...</p>
      </div>
    </div>
  );
}
