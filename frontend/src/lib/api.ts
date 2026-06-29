import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((promise) => {
    if (token) {
      promise.resolve(token);
    } else {
      promise.reject(error);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        processQueue(error, null);
        isRefreshing = false;
        localStorage.removeItem('token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const newToken = data.token;
        localStorage.setItem('token', newToken);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

export const authApi = {
  me: () => api.get('/auth/me'),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  switchRole: (role: string) => api.post('/auth/switch-role', { role }),
};

export const teamsApi = {
  list: () => api.get('/teams'),
  getRoleLevels: (teamId: string) => api.get(`/teams/${teamId}/role-levels`),
};

export const accountsApi = {
  list: () => api.get('/accounts'),
  getTeams: (accountId: string) => api.get(`/accounts/${accountId}/teams`),
  getRoleLevels: (accountId: string, teamId: string) =>
    api.get(`/accounts/${accountId}/teams/${teamId}/role-levels`),
};

export const requestsApi = {
  create: (data: {
    targetAccountId: string;
    secretArns: string[];
    actionsRequested: string[];
    justification: string;
    environment: string;
    durationHours: number;
    team?: string;
    roleLevel?: string;
    accessScope?: string;
  }) => api.post('/requests', data),
  list: (params?: Record<string, string | number>) => api.get('/requests', { params }),
  getById: (id: string) => api.get(`/requests/${id}`),
  approve: (id: string, data?: { durationHoursOverride?: number; approverNotes?: string }) =>
    api.patch(`/requests/${id}/approve`, data || {}),
  reject: (id: string, data: { rejectionNotes: string }) => api.patch(`/requests/${id}/reject`, data),
  cancel: (id: string) => api.patch(`/requests/${id}/cancel`),
  revoke: (id: string) => api.delete(`/requests/${id}`),
  policyPreview: (id: string) => api.get(`/requests/${id}/policy-preview`),
  revokePreview: (id: string) => api.get(`/requests/${id}/revoke-preview`),
  stats: () => api.get('/requests/stats'),
};

export const auditApi = {
  query: (params?: Record<string, string | number>) => api.get('/audit', { params }),
};

export const adminApi = {
  users: () => api.get('/admin/users'),
  requests: (status?: string) => api.get('/admin/requests', { params: status ? { status } : {} }),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: Record<string, unknown>) => api.put('/settings', data),
  testSlack: (data: { webhookUrl?: string; channel?: string }) => api.post('/settings/test-slack', data),
};
