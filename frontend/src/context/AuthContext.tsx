import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi } from '@/lib/api';
import type { Role, User } from '@/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  loginWithSSO: () => void;
  handleSSOCallback: (token: string, refreshToken?: string) => Promise<void>;
  logout: () => void;
  switchRole: (role: Role) => Promise<void>;
  isAuthenticated: boolean;
  isApprover: boolean;
  isAuditor: boolean;
  canSwitchRole: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authApi.me()
        .then(({ data }) => setUser(data))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const loginWithSSO = () => {
    window.location.href = '/api/v1/auth/sso/login';
  };

  const handleSSOCallback = useCallback(async (token: string, refreshToken?: string) => {
    localStorage.setItem('token', token);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    const { data } = await authApi.me();
    setUser(data);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  const switchRole = async (role: Role) => {
    const { data } = await authApi.switchRole(role);
    localStorage.setItem('token', data.token);
    const { data: fullUser } = await authApi.me();
    setUser(fullUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginWithSSO,
        handleSSOCallback,
        logout,
        switchRole,
        isAuthenticated: !!user,
        isApprover: user?.role === 'APPROVER',
        isAuditor: user?.role === 'AUDITOR',
        canSwitchRole: (user?.roles?.length ?? 0) > 1,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
