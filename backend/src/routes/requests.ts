import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { RequestService } from '../services/request.service';
import {
  createRequestSchema,
  approveRequestSchema,
  rejectRequestSchema,
  listRequestsSchema,
} from '../validators/request.validator';

const router = Router();

router.use(authenticate);

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function clientIp(req: Request): string | undefined {
  const ip = req.ip;
  return typeof ip === 'string' ? ip : undefined;
}

function ua(req: Request): string | undefined {
  const v = req.headers['user-agent'];
  return typeof v === 'string' ? v : undefined;
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRequestSchema.parse(req.body);
    const result = await RequestService.create(input, req.user!, clientIp(req), ua(req));
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = listRequestsSchema.parse(req.query);
    const result = await RequestService.list(params, req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await RequestService.getStats(req.user!);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.getById(paramId(req), req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/policy-preview', authorize('APPROVER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.policyPreview(paramId(req), req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/revoke-preview', authorize('APPROVER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.revokePreview(paramId(req), req.user!);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/approve', authorize('APPROVER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = approveRequestSchema.parse(req.body);
    const result = await RequestService.approve(paramId(req), input, req.user!, clientIp(req), ua(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/reject', authorize('APPROVER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = rejectRequestSchema.parse(req.body);
    const result = await RequestService.reject(paramId(req), input, req.user!, clientIp(req), ua(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.cancel(paramId(req), req.user!, clientIp(req), ua(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize('APPROVER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await RequestService.revoke(paramId(req), req.user!, clientIp(req), ua(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as requestRoutes };
