import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', (_req: Request, res: Response) => {
  res.json({ teams: [] });
});

router.get('/:teamId/role-levels', (_req: Request, res: Response) => {
  res.json({ roleLevels: [] });
});

export { router as teamRoutes };
