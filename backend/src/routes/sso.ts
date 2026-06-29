import { Router, Request, Response, NextFunction } from 'express';
import * as client from 'openid-client';
import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { getJwtSecret, getSsoCredentials } from '../utils/secrets';
import { AuditService } from '../services/audit.service';
import { logger } from '../utils/logger';
import type { Role } from '@prisma/client';

const router = Router();

const JUMPCLOUD_ISSUER = process.env.JUMPCLOUD_ISSUER || 'https://oauth.id.jumpcloud.com/';
const SSO_CALLBACK_URL = process.env.SSO_CALLBACK_URL || 'https://localhost/api/v1/auth/sso/callback';
const ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_TTL = 30 * 24 * 3600;

const MAX_PENDING_FLOWS = 1000;
const pendingFlows = new Map<string, { codeVerifier: string; nonce: string }>();

function knownGroupKey(key: string): boolean {
  const mapping = parseGroupMapping();
  return Array.from(mapping.keys()).some((g) => key.includes(g));
}

function parseGroupMapping(): Map<string, Role> {
  const mapping = process.env.SSO_GROUP_MAPPING || 'IamPlatform-Requesters:REQUESTER,IamPlatform-Approvers:APPROVER,IamPlatform-Auditors:AUDITOR';
  const map = new Map<string, Role>();
  for (const pair of mapping.split(',')) {
    const [group, role] = pair.trim().split(':');
    if (group && role) {
      map.set(group.trim(), role.trim() as Role);
    }
  }
  return map;
}

function mapGroupsToRoles(groups: string[]): Role[] {
  const groupMapping = parseGroupMapping();
  const roles = new Set<Role>();

  for (const group of groups) {
    const role = groupMapping.get(group);
    if (role) roles.add(role);
  }

  if (roles.size === 0) {
    roles.add('REQUESTER');
  }

  return Array.from(roles);
}

let oidcConfig: client.Configuration | null = null;

async function getOidcConfig(): Promise<client.Configuration> {
  if (oidcConfig) return oidcConfig;

  const { clientId, clientSecret } = await getSsoCredentials();

  oidcConfig = await client.discovery(
    new URL(JUMPCLOUD_ISSUER),
    clientId,
    clientSecret,
  );

  return oidcConfig;
}

router.get('/login', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (pendingFlows.size >= MAX_PENDING_FLOWS) {
      // Evict oldest entries to prevent memory exhaustion
      const iterator = pendingFlows.keys();
      for (let i = 0; i < 100 && pendingFlows.size >= MAX_PENDING_FLOWS; i++) {
        const oldest = iterator.next().value;
        if (oldest) pendingFlows.delete(oldest);
      }
    }

    const config = await getOidcConfig();
    const { clientId } = await getSsoCredentials();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const nonce = client.randomNonce();
    const state = crypto.randomBytes(16).toString('hex');

    pendingFlows.set(state, { codeVerifier, nonce });
    setTimeout(() => pendingFlows.delete(state), 10 * 60 * 1000);

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: SSO_CALLBACK_URL,
      scope: 'openid profile email groups',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      client_id: clientId,
    });

    res.redirect(authUrl.href);
  } catch (error) {
    logger.error('SSO login initiation failed', { error });
    next(error);
  }
});

router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOidcConfig();

    const state = req.query.state as string;
    const flow = pendingFlows.get(state);
    if (!flow) {
      res.redirect('/?error=invalid_state');
      return;
    }
    pendingFlows.delete(state);

    const callbackUrl = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`);

    const tokenSet = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedNonce: flow.nonce,
      expectedState: state,
    });

    const claims = tokenSet.claims();
    if (!claims) {
      res.redirect('/?error=no_claims');
      return;
    }

    const email = claims.email as string;
    const name = (claims.name as string) || (claims.preferred_username as string) || email;

    // Extract groups from all possible sources
    let groups: string[] = [];

    function extractGroups(source: Record<string, unknown>): string[] {
      const raw = source.groups || source.memberOf
        || source['urn:ietf:params:scim:schemas:core:2.0:User:groups'];
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
      if (typeof raw === 'string' && raw.length > 0) return raw.split(',').map((g) => g.trim()).filter(Boolean);
      return [];
    }

    // 1. Try ID token claims
    groups = extractGroups(claims as Record<string, unknown>);

    logger.info(`SSO id_token for ${email}`, {
      claimKeys: Object.keys(claims),
      groupsRaw: claims.groups,
      groupsType: typeof claims.groups,
      groupsIsArray: Array.isArray(claims.groups),
      extracted: groups,
    });

    // 2. Fallback: fetch userinfo endpoint
    if (groups.length === 0) {
      try {
        const accessToken = tokenSet.access_token;
        if (accessToken && claims.sub) {
          const fetchUserInfo = (client as unknown as Record<string, Function>).fetchUserInfo;
          if (typeof fetchUserInfo === 'function') {
            const userinfo = await fetchUserInfo(config, accessToken, claims.sub as string) as Record<string, unknown>;

            groups = extractGroups(userinfo);

            // JumpCloud sometimes embeds group names as comma-separated keys
            if (groups.length === 0) {
              const groupMapping = parseGroupMapping();
              const knownGroupNames = Array.from(groupMapping.keys());
              for (const key of Object.keys(userinfo)) {
                if (knownGroupNames.some((g) => key.includes(g))) {
                  groups = key.split(',').map((g) => g.trim()).filter(Boolean);
                  break;
                }
              }
            }

            // Log full detail including actual values for diagnosis
            const safeSnapshot: Record<string, unknown> = {};
            for (const k of Object.keys(userinfo)) {
              const v = userinfo[k];
              if (['groups', 'memberOf'].includes(k) || knownGroupKey(k)) {
                safeSnapshot[k] = v;
              }
            }

            logger.info(`SSO userinfo for ${email}`, {
              userinfoKeys: Object.keys(userinfo),
              groupRelatedValues: safeSnapshot,
              extractedGroups: groups,
            });
          }
        }
      } catch (userinfoErr) {
        logger.warn(`Failed to fetch userinfo for ${email}`, { error: String(userinfoErr) });
      }
    }

    logger.info(`SSO final groups for ${email}`, { groups });

    if (!email) {
      res.redirect('/?error=no_email');
      return;
    }

    const roles = mapGroupsToRoles(groups);
    const existingUser = await prisma.user.findUnique({ where: { email } });

    // Block login for explicitly deactivated users
    if (existingUser && !existingUser.isActive) {
      logger.warn(`SSO login blocked for deactivated user: ${email}`);
      const frontendUrl = process.env.CORS_ORIGIN || 'https://localhost';
      res.redirect(`${frontendUrl}/?error=account_deactivated`);
      return;
    }

    const activeRole = existingUser?.role && roles.includes(existingUser.role)
      ? existingUser.role
      : (roles.includes('APPROVER') ? 'APPROVER' : roles[0]);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        roles,
        role: activeRole,
        lastLoginAt: new Date(),
      },
      create: {
        email,
        name,
        roles,
        role: activeRole,
        password: '',
        lastLoginAt: new Date(),
      },
    });

    const jwtSecret = await getJwtSecret();

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL } satisfies SignOptions,
    );

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      jwtSecret,
      { expiresIn: REFRESH_TOKEN_TTL } satisfies SignOptions,
    );

    await AuditService.log({
      eventType: 'USER_LOGIN',
      actorId: user.id,
      actorRole: user.role,
      eventData: { method: 'SSO', groups, roles },
      ipAddress: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: req.headers['user-agent'],
    });

    logger.info(`SSO login successful for ${email}, roles: ${roles.join(', ')}`);

    const frontendUrl = process.env.CORS_ORIGIN || 'https://localhost';
    res.redirect(`${frontendUrl}/sso/callback?token=${token}&refreshToken=${refreshToken}`);
  } catch (error) {
    logger.error('SSO callback failed', { error });
    const frontendUrl = process.env.CORS_ORIGIN || 'https://localhost';
    res.redirect(`${frontendUrl}/?error=sso_failed`);
  }
});

export { router as ssoRoutes };
