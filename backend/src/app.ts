import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { requestRoutes } from './routes/requests';
import { authRoutes } from './routes/auth';
import { ssoRoutes } from './routes/sso';
import { auditRoutes } from './routes/audit';
import { adminRoutes } from './routes/admin';
import { healthRoutes } from './routes/health';
import { teamRoutes } from './routes/teams';
import { accountRoutes } from './routes/accounts';
import { settingsRoutes } from './routes/settings';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://localhost',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

morgan.token('redacted-url', (req: express.Request) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('/sso/callback') || url.includes('token') || url.includes('code=')) {
    return url.split('?')[0] + '?[REDACTED]';
  }
  return url;
});
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :redacted-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth/sso', ssoRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/accounts', accountRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/settings', settingsRoutes);

app.use(errorHandler);

export default app;
