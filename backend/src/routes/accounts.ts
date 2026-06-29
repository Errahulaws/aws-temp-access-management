import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getAccounts } from '../config/accounts';
import { getTeamsForAccount, getRoleLevelsForTeam } from '../config/teams';

const router = Router();

router.use(authenticate);

router.get('/', (_req: Request, res: Response) => {
  const accounts = getAccounts().map((a) => ({
    id: a.id,
    accountId: a.accountId,
    label: a.label,
  }));
  res.json({ accounts });
});

router.get('/:accountId/teams', (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const teams = getTeamsForAccount(accountId).map((t) => ({
    id: t.id,
    label: t.label,
  }));
  res.json({ teams });
});

router.get('/:accountId/teams/:teamId/role-levels', (req: Request, res: Response) => {
  const accountId = req.params.accountId as string;
  const teamId = req.params.teamId as string;
  const roleLevels = getRoleLevelsForTeam(teamId, accountId).map((rl) => ({
    id: rl.id,
    label: rl.label,
  }));
  res.json({ roleLevels });
});

export { router as accountRoutes };
