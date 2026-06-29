import { Router, Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { getJwtSecret } from '../utils/secrets';

const ACCESS_TOKEN_TTL = 3600;

const router = Router();

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    const jwtSecret = await getJwtSecret();
    const decoded = jwt.verify(refreshToken, jwtSecret, { algorithms: ['HS256'] }) as { id: string; type: string };
    if (decoded.type !== 'refresh') throw new UnauthorizedError('Invalid refresh token');

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL } satisfies SignOptions,
    );

    res.json({ token });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roles: true,
        department: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    const activeGrants = await prisma.accessRequest.count({
      where: { requesterId: req.user!.id, status: 'ACTIVE' },
    });

    res.json({ ...user, activeGrants });
  } catch (error) {
    next(error);
  }
});

router.post('/switch-role', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    if (!role) throw new ValidationError('Role is required');

    const validRoles = ['REQUESTER', 'APPROVER', 'AUDITOR'];
    if (!validRoles.includes(role)) {
      throw new ValidationError(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new UnauthorizedError('User not found');

    if (!user.roles.includes(role)) {
      throw new ValidationError(`You do not have the ${role} role`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { role },
    });

    const jwtSecret = await getJwtSecret();
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL } satisfies SignOptions,
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role, roles: user.roles },
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRoutes };
