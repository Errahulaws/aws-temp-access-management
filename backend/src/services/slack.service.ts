import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const ALLOWED_WEBHOOK_HOSTS = ['hooks.slack.com', 'hooks.slack-gov.com'];

function getSlackUserMappings(): Record<string, string> {
  const mappings: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SLACK_USER_') && key !== 'SLACK_USER_MAP' && value) {
      const email = key.replace('SLACK_USER_', '').toLowerCase().replace(/_/g, '.').replace(/\.AT\./i, '@');
      mappings[email] = value;
    }
  }
  if (process.env.SLACK_USER_MAP) {
    for (const pair of process.env.SLACK_USER_MAP.split(',')) {
      const [email, slackId] = pair.split(':');
      if (email && slackId) mappings[email.trim().toLowerCase()] = slackId.trim();
    }
  }
  return mappings;
}

function getSlackMention(email: string): string {
  const mappings = getSlackUserMappings();
  const slackId = mappings[email.toLowerCase()];
  return slackId ? `<@${slackId}>` : email;
}

function getApproverMentions(): string {
  const mappings = getSlackUserMappings();
  const mentions = Object.values(mappings).map((id) => `<@${id}>`);
  return mentions.length > 0 ? mentions.join(' ') : '';
}

function getAccountLabel(accountId: string): string {
  const label = process.env[`ACCOUNT_${accountId}_LABEL`];
  return label ? `${label.replace(/"/g, '')} (${accountId})` : accountId;
}

function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_WEBHOOK_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

interface SlackSettings {
  enabled: boolean;
  webhookUrl: string | null;
  channel: string | null;
  notifyOnCreate: boolean;
  notifyOnApprove: boolean;
  notifyOnReject: boolean;
  notifyOnRevoke: boolean;
}

interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

export class SlackService {
  private static async getSettings(): Promise<SlackSettings> {
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      return {
        enabled: false,
        webhookUrl: null,
        channel: null,
        notifyOnCreate: true,
        notifyOnApprove: true,
        notifyOnReject: true,
        notifyOnRevoke: true,
      };
    }
    return {
      enabled: settings.slackEnabled,
      webhookUrl: settings.slackWebhookUrl,
      channel: settings.slackChannel,
      notifyOnCreate: settings.slackNotifyOnCreate,
      notifyOnApprove: settings.slackNotifyOnApprove,
      notifyOnReject: settings.slackNotifyOnReject,
      notifyOnRevoke: settings.slackNotifyOnRevoke,
    };
  }

  private static async send(message: SlackMessage): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.webhookUrl) return;

    if (!isAllowedWebhookUrl(settings.webhookUrl)) {
      logger.error('Slack webhook URL blocked: not an allowed Slack domain', { url: settings.webhookUrl });
      return;
    }

    try {
      const body: Record<string, unknown> = { ...message };
      if (settings.channel) body.channel = settings.channel;

      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        logger.error('Slack webhook failed', { status: response.status, statusText: response.statusText });
      }
    } catch (error) {
      logger.error('Slack notification failed', { error });
    }
  }

  static async notifyRequestCreated(params: {
    requesterName: string;
    requesterEmail: string;
    team: string;
    roleLevel: string;
    environment: string;
    durationHours: number;
    secretCount: number;
    accessScope: string;
    requestId: string;
    targetAccountId?: string;
    justification?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.notifyOnCreate) return;

    const approverMentions = getApproverMentions();
    const accountDisplay = params.targetAccountId ? getAccountLabel(params.targetAccountId) : 'N/A';

    const fields = [
      { type: 'mrkdwn', text: `*Requester:*\n${params.requesterName} (${params.requesterEmail})` },
      { type: 'mrkdwn', text: `*Team / Role:*\n${params.team} / ${params.roleLevel}` },
      { type: 'mrkdwn', text: `*Account:*\n${accountDisplay}` },
      { type: 'mrkdwn', text: `*Duration:*\n${params.durationHours >= 1 ? `${params.durationHours} hours` : `${params.durationHours * 60} minutes`}` },
      { type: 'mrkdwn', text: `*Scope:*\n${params.accessScope === 'all' ? 'All secrets' : `${params.secretCount} specific secret(s)`}` },
    ];

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔑 New Access Request' },
      },
      {
        type: 'section',
        fields,
      },
    ];

    if (params.justification) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Justification:*\n>${params.justification.replace(/\n/g, '\n>')}` },
      });
    }

    if (approverMentions) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Approvers:* ${approverMentions} — please review this request.` },
      });
    }

    blocks.push(
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Request ID: \`${params.requestId.slice(0, 8)}\` • Awaiting approval` },
        ],
      },
      { type: 'divider' },
    );

    await this.send({
      text: `🔑 New Access Request from ${params.requesterName} — ${approverMentions || 'Awaiting approval'}`,
      blocks,
    });
  }

  static async notifyRequestApproved(params: {
    requesterName: string;
    approverName: string;
    team: string;
    roleLevel: string;
    environment: string;
    durationHours: number;
    expiresAt: string;
    requestId: string;
    targetAccountId?: string;
    approverNotes?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.notifyOnApprove) return;

    const accountDisplay = params.targetAccountId ? getAccountLabel(params.targetAccountId) : 'N/A';

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '✅ Access Request Approved' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Requester:*\n${params.requesterName}` },
          { type: 'mrkdwn', text: `*Approved by:*\n${params.approverName}` },
          { type: 'mrkdwn', text: `*Team / Role:*\n${params.team} / ${params.roleLevel}` },
          { type: 'mrkdwn', text: `*Account:*\n${accountDisplay}` },
          { type: 'mrkdwn', text: `*Duration:*\n${params.durationHours >= 1 ? `${params.durationHours} hours` : `${params.durationHours * 60} minutes`}` },
          { type: 'mrkdwn', text: `*Expires at:*\n${params.expiresAt}` },
        ],
      },
    ];

    if (params.approverNotes) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Approver Notes:*\n>${params.approverNotes.replace(/\n/g, '\n>')}` },
      });
    }

    blocks.push(
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Request ID: \`${params.requestId.slice(0, 8)}\` • IAM policy applied` },
        ],
      },
      { type: 'divider' },
    );

    await this.send({
      text: `✅ Access Approved for ${params.requesterName} by ${params.approverName}`,
      blocks,
    });
  }

  static async notifyRequestRejected(params: {
    requesterName: string;
    approverName: string;
    team: string;
    environment: string;
    reason: string;
    requestId: string;
    targetAccountId?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.notifyOnReject) return;

    const accountDisplay = params.targetAccountId ? getAccountLabel(params.targetAccountId) : 'N/A';

    await this.send({
      text: `❌ Access Rejected for ${params.requesterName} by ${params.approverName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '❌ Access Request Rejected' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Requester:*\n${params.requesterName}` },
            { type: 'mrkdwn', text: `*Rejected by:*\n${params.approverName}` },
            { type: 'mrkdwn', text: `*Team:*\n${params.team}` },
            { type: 'mrkdwn', text: `*Account:*\n${accountDisplay}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:*\n>${params.reason}` },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Request ID: \`${params.requestId.slice(0, 8)}\`` },
          ],
        },
        { type: 'divider' },
      ],
    });
  }

  static async notifyAccessRevoked(params: {
    requesterName: string;
    revokedBy: string;
    team: string;
    environment: string;
    requestId: string;
    reason?: string;
    targetAccountId?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.notifyOnRevoke) return;

    const accountDisplay = params.targetAccountId ? getAccountLabel(params.targetAccountId) : 'N/A';

    await this.send({
      text: `🚫 Access Revoked for ${params.requesterName} by ${params.revokedBy}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚫 Access Revoked' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*User:*\n${params.requesterName}` },
            { type: 'mrkdwn', text: `*Revoked by:*\n${params.revokedBy}` },
            { type: 'mrkdwn', text: `*Team:*\n${params.team}` },
            { type: 'mrkdwn', text: `*Account:*\n${accountDisplay}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Request ID: \`${params.requestId.slice(0, 8)}\` • IAM policy statement removed` },
          ],
        },
        { type: 'divider' },
      ],
    });
  }

  static clearCache(): void {
    // Force re-read settings on next call
  }

  static async testWebhook(webhookUrl: string, channel?: string): Promise<{ ok: boolean; error?: string }> {
    if (!isAllowedWebhookUrl(webhookUrl)) {
      return { ok: false, error: 'Webhook URL must be an HTTPS URL on hooks.slack.com' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channel || undefined,
          text: '✅ IAM Access Platform — Slack integration test successful!',
        }),
      });
      if (response.ok) return { ok: true };
      return { ok: false, error: `Slack returned ${response.status}` };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  static async notifyAccessExpired(params: {
    requesterName: string;
    team: string;
    environment: string;
    requestId: string;
    targetAccountId?: string;
  }): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.notifyOnRevoke) return;

    const accountDisplay = params.targetAccountId ? getAccountLabel(params.targetAccountId) : 'N/A';

    await this.send({
      text: `⏰ Access Expired for ${params.requesterName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⏰ Access Expired' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*User:*\n${params.requesterName}` },
            { type: 'mrkdwn', text: `*Team:*\n${params.team}` },
            { type: 'mrkdwn', text: `*Account:*\n${accountDisplay}` },
          ],
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `Request ID: \`${params.requestId.slice(0, 8)}\` • IAM policy statement removed automatically` },
          ],
        },
        { type: 'divider' },
      ],
    });
  }
}
