import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { getAccountConfig } from '../config/accounts';

const router = Router();

router.use(authenticate);
router.use(authorize('APPROVER'));

router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          roles: true,
          department: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              requestsMade: { where: { status: 'ACTIVE' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    const result = users.map((u) => ({
      ...u,
      activeGrants: u._count.requestsMade,
      _count: undefined,
    }));

    res.json({ data: result, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ROLLBACK_FAILED'];
    const where: Record<string, unknown> = {};
    if (status) {
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } });
        return;
      }
      where.status = status;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const [requests, total] = await Promise.all([
      prisma.accessRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true, department: true } },
          approver: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.accessRequest.count({ where }),
    ]);

    const enriched = requests.map((r) => {
      const config = r.targetAccountId ? getAccountConfig(r.targetAccountId) : undefined;
      return { ...r, accountLabel: config?.label?.replace(/"/g, '') || r.targetAccountId || undefined };
    });

    res.json({ data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});


export { router as adminRoutes };
