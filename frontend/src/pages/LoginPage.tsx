import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { KeyRound, Shield, Lock, ArrowRight } from 'lucide-react';

export function LoginPage() {
  const { loginWithSSO } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">IAM Access Platform</h1>
              <p className="text-sm text-primary-200">Secrets Manager Governance</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Secure, governed<br />access to critical resources
          </h2>
          <p className="text-primary-200 text-lg max-w-md leading-relaxed mb-12">
            Self-service access requests with automated policy management, time-bounded grants, and full audit trails.
          </p>

          <div className="space-y-6">
            {[
              { icon: Shield, text: 'Least-privilege IAM policy enforcement' },
              { icon: Lock, text: 'Time-bounded access with auto-revocation' },
              { icon: ArrowRight, text: 'Full audit trail for compliance' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-4 w-4 text-primary-200" />
                </div>
                <span className="text-sm text-primary-100">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - SSO Login */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">IAM Access Platform</h1>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Sign in to your account</h2>
            <p className="mt-2 text-sm text-slate-500">Use your organization's SSO to access the platform</p>
          </div>

          <Button onClick={loginWithSSO} className="w-full" size="lg">
            Sign in with JumpCloud
          </Button>

          <p className="mt-6 text-center text-xs text-slate-400">
            Your account is automatically provisioned on first login based on your JumpCloud group membership.
          </p>
        </div>
      </div>
    </div>
  );
}
