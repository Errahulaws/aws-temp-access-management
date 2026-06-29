import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { SlackService } from '../services/slack.service';
import { AuditService } from '../services/audit.service';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(authorize('APPROVER'));

const ALLOWED_WEBHOOK_HOSTS = ['hooks.slack.com', 'hooks.slack-gov.com'];

const slackSettingsSchema = z.object({
  slackEnabled: z.boolean(),
  slackWebhookUrl: z.string().url().refine((url) => {
    if (!url || url.includes('****')) return true;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_WEBHOOK_HOSTS.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
      );
    } catch { return false; }
  }, 'Webhook URL must be HTTPS on hooks.slack.com').optional().or(z.literal('')),
  slackChannel: z.string().max(80).optional().or(z.literal('')),
  slackNotifyOnCreate: z.boolean().optional(),
  slackNotifyOnApprove: z.boolean().optional(),
  slackNotifyOnReject: z.boolean().optional(),
  slackNotifyOnRevoke: z.boolean().optional(),
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: 'singleton' } });
    }

    res.json({
      slackEnabled: settings.slackEnabled,
      slackWebhookUrl: settings.slackWebhookUrl ? maskUrl(settings.slackWebhookUrl) : null,
      slackWebhookConfigured: !!settings.slackWebhookUrl,
      slackChannel: settings.slackChannel,
      slackNotifyOnCreate: settings.slackNotifyOnCreate,
      slackNotifyOnApprove: settings.slackNotifyOnApprove,
      slackNotifyOnReject: settings.slackNotifyOnReject,
      slackNotifyOnRevoke: settings.slackNotifyOnRevoke,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = slackSettingsSchema.parse(req.body);

    const existing = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });

    const data: Record<string, unknown> = {
      slackEnabled: input.slackEnabled,
      slackNotifyOnCreate: input.slackNotifyOnCreate ?? true,
      slackNotifyOnApprove: input.slackNotifyOnApprove ?? true,
      slackNotifyOnReject: input.slackNotifyOnReject ?? true,
      slackNotifyOnRevoke: input.slackNotifyOnRevoke ?? true,
      updatedBy: req.user!.id,
    };

    if (input.slackChannel !== undefined) {
      data.slackChannel = input.slackChannel || null;
    }

    // Only update webhook URL if a new one is provided (not masked)
    if (input.slackWebhookUrl && !input.slackWebhookUrl.includes('****')) {
      data.slackWebhookUrl = input.slackWebhookUrl;
    }

    const settings = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data } as never,
      update: data,
    });

    SlackService.clearCache();

    await AuditService.log({
      eventType: 'SETTINGS_UPDATED',
      actorId: req.user!.id,
      actorRole: req.user!.role,
      eventData: {
        slackEnabled: settings.slackEnabled,
        slackChannel: settings.slackChannel,
        webhookChanged: !!input.slackWebhookUrl && !input.slackWebhookUrl.includes('****'),
      },
    });

    res.json({
      slackEnabled: settings.slackEnabled,
      slackWebhookUrl: settings.slackWebhookUrl ? maskUrl(settings.slackWebhookUrl) : null,
      slackWebhookConfigured: !!settings.slackWebhookUrl,
      slackChannel: settings.slackChannel,
      slackNotifyOnCreate: settings.slackNotifyOnCreate,
      slackNotifyOnApprove: settings.slackNotifyOnApprove,
      slackNotifyOnReject: settings.slackNotifyOnReject,
      slackNotifyOnRevoke: settings.slackNotifyOnRevoke,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

const testSlackSchema = z.object({
  webhookUrl: z.string().url('Invalid webhook URL').optional().or(z.literal('')),
  channel: z.string().max(80, 'Channel name too long').optional().or(z.literal('')),
});

router.post('/test-slack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = testSlackSchema.parse(req.body);

    let urlToTest = input.webhookUrl;

    // If the client sent the masked URL or empty, use the stored one
    if (!urlToTest || urlToTest.includes('****')) {
      const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
      urlToTest = settings?.slackWebhookUrl ?? undefined;
    }

    if (!urlToTest) {
      res.status(400).json({ ok: false, error: 'No webhook URL configured' });
      return;
    }

    const result = await SlackService.testWebhook(urlToTest, input.channel);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const parts = path.split('/');
    if (parts.length > 2) {
      const last = parts[parts.length - 1];
      parts[parts.length - 1] = last.slice(0, 6) + '****' + last.slice(-4);
    }
    return `${parsed.origin}${parts.join('/')}`;
  } catch {
    return '****';
  }
}

export { router as settingsRoutes };
