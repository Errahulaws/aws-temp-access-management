import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuditService } from '../services/audit.service';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(authorize('APPROVER', 'AUDITOR'));

const VALID_EVENT_TYPES = [
  'REQUEST_CREATED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'REQUEST_CANCELLED',
  'REQUEST_EXPIRED',
  'POLICY_APPLIED',
  'POLICY_REVOKED',
  'USER_LOGIN',
  'SETTINGS_UPDATED',
] as const;

const querySchema = z.object({
  eventType: z.enum(VALID_EVENT_TYPES).optional(),
  actorId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = querySchema.parse(req.query);
    const result = await AuditService.query(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };
