import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'iam-access-request-platform',
    version: '1.3.0',
  });
});

export { router as healthRoutes };
