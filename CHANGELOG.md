# Changelog

All notable changes to the IAM Access Request & Secrets Manager Governance Platform.

---

## [1.3.0] - 2026-06-15

### Added — Slack Notification Enhancements
- **Account ID** displayed in all Slack notifications (shown as "Label (account-id)")
- **Justification** included in "New Access Request" notifications
- **Approver Notes** included in "Request Approved" notifications
- **Approver tagging** — map Slack User IDs via `SLACK_USER_MAP` env var to @mention approvers on new requests

### Added — Audit Log Improvements
- `REQUEST_CREATED` audit events now include: justification, targetAccountId, team, roleLevel, accessScope
- `REQUEST_APPROVED` audit events include approver notes and duration override
- All audit events include full context for compliance review

---

## [1.2.0] - 2026-06-15

### Security Fixes

#### Critical
- **SSRF via legacy admin Slack routes** — Removed unprotected `/api/v1/admin/settings/slack*` endpoints that bypassed the webhook URL allowlist. All Slack configuration now goes through the hardened `/api/v1/settings` routes.

#### High
- **SSO reactivation of deactivated users** — SSO login no longer unconditionally sets `isActive: true`. Deactivated users are now blocked at login with a clear error message.
- **Unbounded admin list endpoints (DoS)** — Added pagination (max 100 per page) to `/admin/users` and `/admin/requests` to prevent memory exhaustion with large datasets.
- **Sensitive query params in access logs** — SSO callback codes, tokens, and state parameters are now redacted from morgan access logs to prevent credential leakage via log access.

#### Medium
- **Host header injection** — HTTP→HTTPS redirect in nginx now uses `$server_addr` instead of client-supplied `$host`, preventing phishing redirects.
- **Missing Content-Security-Policy** — Added strict CSP header restricting scripts, styles, and connections to `'self'` only.
- **Static asset headers dropped** — Security headers (X-Frame-Options, HSTS, X-Content-Type-Options) now correctly applied to static assets (JS, CSS, images).
- **No `.dockerignore` files** — Created for both backend and frontend to prevent `.env`, tests, `.git`, and other sensitive files from being embedded in Docker images.
- **Backend container ran as root** — Added non-root `appuser` (using Alpine's `adduser`) with `USER` directive in Dockerfile.
- **Unbounded expiration batch** — `processExpiredRequests()` now processes max 50 expired requests per run (oldest first) to prevent memory spikes.
- **Hidden file access** — Added `location ~ /\. { deny all; }` in nginx to block access to `.git`, `.env`, etc.
- **Missing Permissions-Policy header** — Added to disable camera, microphone, and geolocation APIs.
- **X-XSS-Protection modernized** — Changed from `1; mode=block` to `0` per OWASP recommendation (CSP replaces this).
- **Request body size limit** — Reduced nginx proxy `client_max_body_size` from 1MB to 16KB for the API proxy.

---

## [1.1.0] - 2026-06-15

### Security Fixes

#### Critical
- **Stale JWT roles** — Auth middleware now queries the database on every request to verify user's current role and `isActive` status, preventing privilege escalation via stale JWT claims.
- **TOCTOU race conditions** — All status transitions (approve/reject/cancel/revoke) use atomic `updateMany` with status guard to prevent concurrent double-approval or double-revocation.
- **Fail-closed policy generation** — Policy service now throws an error if `aws:userid` cannot be resolved (missing role ID or account configuration), preventing creation of over-permissive statements.

#### High
- **Self-approval enforcement** — Backend rejects approval attempts where `approverId === requesterId`, in addition to frontend blocking.
- **SSRF on Slack webhooks** — Webhook URLs restricted to `https://hooks.slack.com` and `https://hooks.slack-gov.com` domains only.
- **JWT algorithm pinning** — All `jwt.verify()` calls pinned to `algorithms: ['HS256']` to prevent algorithm confusion attacks.
- **Approver notes mandatory** — Backend validation requires `approverNotes` (min 10 chars) on approval, preventing empty approvals.
- **Frontend route guards** — Added `RequireRole` component wrapping admin, audit, and settings routes.
- **SSO callback token cleanup** — Tokens immediately removed from URL via `history.replaceState` to prevent browser history leakage.

#### Medium
- **Input length limits** — Added max length validation: team (50), roleLevel (50), principalArn (256), userAgent (512), ipAddress (45).
- **Policy Sid uniqueness** — Changed from 8-char truncated UUID to full UUID (no dashes) to eliminate collision risk.
- **Error message sanitization** — Internal error details replaced with generic "Please contact an administrator" in client-facing responses.
- **Backend validation for all endpoints** — Added server-side validation for: `switch-role` (enum check), `admin/requests` (status filter), `audit` (eventType enum), `test-slack` (URL + channel).
- **roleLevel ↔ team cross-validation** — Backend verifies that selected roleLevel belongs to the team for the target account.
- **ROLLBACK_FAILED status** — If IAM cleanup fails during revocation, request is marked `ROLLBACK_FAILED` instead of `REVOKED` to enable retry.
- **SSO pending flows cap** — Limited to 1000 concurrent SSO flows with LRU eviction to prevent memory exhaustion under flood attacks.
- **Audit field truncation** — `ipAddress` capped at 45 chars, `userAgent` at 512 chars to prevent DB bloat.

---

## [1.0.0] - 2026-06-14

### Added — Core Platform
- JumpCloud OIDC SSO with JIT user provisioning and group-to-role mapping
- Multi-account IAM policy management via STS AssumeRole with External ID
- Team-based access request workflow (DevOps, Security, Developer teams)
- Role levels (L1, L2, L3) per team per account
- Time-bounded access with `DateLessThan` + `aws:userid` conditions
- Dual approval for "All Secrets" scope
- Policy diff preview for approvers (current vs proposed side-by-side)
- Automatic policy cleanup on expiration (cron every 5 minutes)
- Manual revocation with policy diff preview
- Full audit trail with S3 archival (daily) and 7-day DB retention
- Slack notifications for all lifecycle events
- Role switching for multi-role users (Requester ↔ Approver)
- Request cancellation by requester (while PENDING)
- Configuration-driven accounts, teams, and roles via `.env.production`
- HTTPS with nginx reverse proxy
- Docker Compose deployment on single EC2 instance
- No secrets on disk — all fetched from AWS Secrets Manager at runtime via instance role

---

## Configuration Reference

### Environment Variables (`.env.production`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_REGION` | Yes | AWS region for Secrets Manager and S3 |
| `APP_SECRET_NAME` | Yes | Secrets Manager secret name |
| `APP_URL` | Yes | Public HTTPS URL of the application |
| `AUDIT_S3_BUCKET` | Yes | S3 bucket for audit log archival |
| `AUDIT_RETENTION_DAYS` | Yes | Days to keep audit logs in DB (default: 7) |
| `JUMPCLOUD_ISSUER` | Yes | JumpCloud OIDC issuer URL |
| `SSO_GROUP_MAPPING` | Yes | JumpCloud group → app role mapping |
| `ACCOUNT_<ID>_ROLE_ARN` | Per account | IAM role to assume in target account |
| `ACCOUNT_<ID>_LABEL` | Per account | Human-readable account name |
| `TEAM_<TEAM>_<ID>_POLICY_ARN` | Per team/account | IAM policy ARN for team |
| `ROLE_ID_<ROLE>_<ID>` | Per role/account | AWS Role ID (AROA...) |
| `SLACK_USER_MAP` | No | Slack tagging: `email:SLACK_ID,...` |

### Secrets Manager Keys (`iam-platform/app-secrets`)

| Key | Description |
|-----|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | JWT signing secret |
| `JUMPCLOUD_CLIENT_ID` | OIDC client ID |
| `JUMPCLOUD_CLIENT_SECRET` | OIDC client secret |
| `STS_EXTERNAL_ID` | External ID for STS AssumeRole |
