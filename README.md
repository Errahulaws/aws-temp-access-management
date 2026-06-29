# IAM Access Request & Secrets Manager Governance Platform

A self-service web application that replaces the manual ticket-based workflow for managing IAM policy grants to AWS Secrets Manager. Provides role-based access control, automated policy lifecycle management, team-based request flows, and a full audit trail.

## Architecture (Single EC2)

```
              ┌─────────── EC2 Instance (t3.small) ────────────┐
              │                                                 │
 Team ──────▶│  :443 nginx (HTTPS + reverse proxy)             │
              │        │                                        │
              │        ▼                                        │
              │  :3001 Express API (backend)                    │
              │        │              │            │            │
              │        ▼              ▼            ▼            │
              │  :5432 PostgreSQL   Secrets Mgr   IAM API      │
              │        │                            │           │
              │        ▼                            ▼           │
              │  Docker Volume (pgdata)   STS AssumeRole       │
              └─────────────────────────────┬──────┬───────────┘
                         │                  │      │
                         ▼                  ▼      ▼
              ┌──────────────────┐  ┌───────────────────────┐
              │ S3 (audit logs)  │  │ Target Account(s)     │
              └──────────────────┘  │  └─ IAM Policies      │
                                    └───────────────────────┘
```

All services run in Docker containers on a single EC2 instance. No secrets are stored on disk — all sensitive values are fetched from AWS Secrets Manager at runtime using the EC2 instance role.

## Tech Stack

| Layer      | Technology                                 |
|------------|--------------------------------------------|
| Frontend   | React 19, TypeScript, Vite, TailwindCSS v4 |
| Backend    | Node.js, Express 5, TypeScript, Prisma ORM |
| Database   | PostgreSQL 16 (Docker, persistent volume)  |
| Auth       | JumpCloud OIDC SSO + JWT                   |
| Secrets    | AWS Secrets Manager (instance role)        |
| IAM Policy | AWS IAM Managed Policies via STS AssumeRole into target accounts |
| Audit      | S3 archival with 7-day DB retention        |
| Notifications | Slack (incoming webhooks, configurable via UI) |
| Validation | Zod (server + client)                      |
| Infra      | Docker Compose on EC2                      |

---

## Key Features

- **JumpCloud SSO** — Single sign-on via OIDC; no local passwords
- **Team-based access** — Users select a team and role level when requesting access
- **Dynamic configuration** — Teams and role levels are driven by `.env.production`; comment out a line to disable it
- **Dual approval** — "All secrets" scope requires 2 separate approvers
- **Policy diff review** — Approvers see current vs. proposed IAM policy side-by-side before confirming
- **Time-bounded access** — Policies use `DateLessThan` condition for auto-expiry
- **Identity-scoped** — Policies use `aws:userid` condition (`ROLE_ID:email`) to restrict to specific users
- **Append-only** — New statements are appended to existing policy; never overwrite
- **Self-approval prevention** — Users cannot approve their own requests
- **Multi-account** — Manage IAM policies across multiple AWS accounts via STS AssumeRole (External ID from Secrets Manager)
- **Slack notifications** — Real-time alerts for request creation, approval, rejection, and revocation
- **Full audit trail** — Every action logged, archived to S3 daily

---

## Configuration-Driven Accounts, Teams & Roles

Everything is **per-account** and controlled by `.env.production`. Account selection is mandatory — users must choose a target account before selecting a team and role level. Only accounts, teams, and roles with their env vars set will appear in the UI.

### How It Works

```env
# This account IS active (ROLE_ARN has a value)
ACCOUNT_<ACCOUNT_ID>_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/iam-update-target-role
ACCOUNT_<ACCOUNT_ID>_LABEL="Production"

# This team IS active
TEAM_DEVOPS_<ACCOUNT_ID>_POLICY_ARN=arn:aws:iam::<ACCOUNT_ID>:policy/devops-temp-access

# This team is DISABLED (commented out)
#TEAM_DEVELOPER_<ACCOUNT_ID>_POLICY_ARN=arn:aws:iam::<ACCOUNT_ID>:policy/developer-temp-access

# This role level IS active
ROLE_ID_DEVOPS_L1_<ACCOUNT_ID>=AROAXXXXXXXXXXXXXXXXX

# This role level is DISABLED (commented out — won't appear)
#ROLE_ID_DEVOPS_L3_<ACCOUNT_ID>=AROAYYYYYYYYYYYYYYYYY
```

### Configuration Variables

| Variable Pattern | Description | Effect when commented/empty |
|-----------------|-------------|----------------------------|
| `ACCOUNT_<ID>_ROLE_ARN` | IAM role to assume in target account | Account hidden from UI |
| `ACCOUNT_<ID>_LABEL` | Human-readable label for the account | Shows "Account <ID>" |
| `TEAM_DEVELOPER_<ID>_POLICY_ARN` | IAM policy ARN for Developer team in that account | Developer team hidden for that account |
| `TEAM_DEVOPS_<ID>_POLICY_ARN` | IAM policy ARN for DevOps team in that account | DevOps team hidden for that account |
| `TEAM_SECURITY_<ID>_POLICY_ARN` | IAM policy ARN for Security team in that account | Security team hidden for that account |
| `ROLE_ID_DEVELOPER_<ID>` | AWS Role ID for Developer role in that account | Developer role hidden |
| `ROLE_ID_DEVOPS_L1_<ID>` | AWS Role ID for DevOps L1 in that account | DevOps L1 hidden |
| `ROLE_ID_DEVOPS_L2_<ID>` | AWS Role ID for DevOps L2 in that account | DevOps L2 hidden |
| `ROLE_ID_DEVOPS_L3_<ID>` | AWS Role ID for DevOps L3 in that account | DevOps L3 hidden |
| `ROLE_ID_DEVOPS_SHADOW_<ID>` | AWS Role ID for DevOps Shadow in that account | DevOps Shadow hidden |
| `ROLE_ID_SECURITY_L1_<ID>` | AWS Role ID for Security L1 in that account | Security L1 hidden |
| `ROLE_ID_SECURITY_L2_<ID>` | AWS Role ID for Security L2 in that account | Security L2 hidden |
| `ROLE_ID_SECURITY_L3_<ID>` | AWS Role ID for Security L3 in that account | Security L3 hidden |

> `<ID>` = 12-digit AWS Account ID (e.g., `111122223333`)

---

## Cross-Account Access (STS AssumeRole)

All IAM policy management is performed via **STS AssumeRole** into target accounts. The platform never directly manages policies — it always assumes a role first, using an **External ID from Secrets Manager** for security.

### How It Works

1. User selects a target account when creating an access request
2. On approval, the platform fetches the External ID from Secrets Manager
3. Calls `sts:AssumeRole` with the target account's role ARN + External ID
4. Temporary credentials (cached 50 min) are used for IAM policy operations
5. Policy preview, approval, revocation, and auto-expiration all use this flow

### Configuration Variables (per account in `.env.production`)

| Variable | Description | Effect when empty/missing |
|----------|-------------|--------------------------|
| `STS_EXTERNAL_ID` (in Secrets Manager) | External ID for STS AssumeRole | Access will fail |
| `ACCOUNT_<ID>_ROLE_ARN` | IAM role ARN to assume in target account | Account not shown in UI |
| `ACCOUNT_<ID>_LABEL` | Display name in the UI | Shows "Account <ID>" |
| `TEAM_<TEAM>_<ID>_POLICY_ARN` | Policy ARN for a team in that account | Team not shown for that account |
| `ROLE_ID_<ROLE>_<ID>` | IAM Role ID (AROA...) for a role level in that account | Role level not shown |

### How Policy Updates Work

1. User selects **Target Account** (mandatory), then Team and Role Level
2. On approval, the platform:
   - Fetches the External ID from Secrets Manager
   - Calls `sts:AssumeRole` with the target account's role ARN + External ID
   - Uses the temporary credentials to update the target account's IAM policy
3. On revocation/expiration, the same flow removes the statement from the target account

### Security Considerations

- The **External ID** lives in the same Secrets Manager secret as other app secrets — never in env vars, logs, or API responses
- Secrets (including External ID) are cached in-memory with a 5-minute TTL and re-fetched automatically
- STS sessions are cached for 50 minutes (out of 1-hour lifetime) to reduce API calls
- IAM is a global service — no per-account region configuration needed for policy operations
- Each target account requires an explicit trust policy referencing both the platform's role and External ID

---

### Policy Statement Format

When access is approved, the platform appends a statement to the team's IAM managed policy:

```json
{
  "Sid": "IAMREQ-abcdef12-prod",
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret"
  ],
  "Resource": [
    "arn:aws:secretsmanager:us-west-2:<ACCOUNT_ID>:secret:prod/my-secret*"
  ],
  "Condition": {
    "StringEquals": {
      "aws:userid": ["AROAXXXXXXXXXXXXXXXXX:user@company.com"]
    },
    "DateGreaterThan": {
      "aws:CurrentTime": "2026-06-10T06:00:00.000Z"
    },
    "DateLessThan": {
      "aws:CurrentTime": "2026-06-11T06:00:00.000Z"
    }
  }
}
```

The `aws:userid` value is built from `ROLE_ID` (from env) + `:` + user's SSO email.

---

## Slack Integration

The platform supports real-time Slack notifications via incoming webhooks. Configure entirely from the UI — no environment variables or restarts needed.

### Setup

1. Create a **Slack Incoming Webhook** in your workspace ([Slack docs](https://api.slack.com/messaging/webhooks))
2. In the application, navigate to **Settings → Slack** (`/admin/slack`)
3. Paste the webhook URL, optionally set a channel override
4. Enable/disable notification types as needed

### Notification Events

| Event | When | Message Contents |
|-------|------|-----------------|
| Request Created | A user submits a new access request | Requester, team/role, **account label**, scope, duration, **justification**, **@approvers tagged** |
| Request Approved | An approver approves a request | Requester, approver, **account label**, duration, expiry time, **approver notes** |
| Request Rejected | An approver rejects a request | Requester, approver, **account label**, rejection reason |
| Access Revoked | An approver manually revokes active access | Requester, revoker, **account label** |
| Access Expired | Scheduled job detects an expired grant | Requester, team, **account label**, policy statement removed |

### Approver Tagging (Slack Mentions)

To tag approvers in Slack when a new request is created, add a `SLACK_USER_MAP` variable in `.env.production`:

```env
# Format: email1:SLACK_ID1,email2:SLACK_ID2
SLACK_USER_MAP=approver1@company.com:UXXXXXXXXXX,approver2@company.com:UYYYYYYYYYYY
```

Find Slack User IDs: Open the user's Slack profile → click "..." menu → "Copy member ID".

When a new request comes in, all mapped approvers will be mentioned (`@user`) in the Slack message for immediate visibility.

### Configuration Options (via UI)

| Setting | Description |
|---------|-------------|
| Slack Enabled | Master toggle for all Slack notifications |
| Webhook URL | Slack incoming webhook URL |
| Channel Override | Optional — send to a specific channel instead of webhook default |
| Notify on Create | Send notification when requests are created |
| Notify on Approve | Send notification when requests are approved |
| Notify on Reject | Send notification when requests are rejected |
| Notify on Revoke | Send notification when access is revoked |

> **Note**: Slack settings are stored in the database (`app_settings` table) and managed via the API. No secrets or webhook URLs are stored in `.env.production`.

---

## Prerequisites (AWS Setup)

Complete these steps **before** deploying the application.

### 1. Create the Secret in AWS Secrets Manager

Create a secret named `iam-platform/app-secrets` in your target region:

```bash
aws secretsmanager create-secret \
  --name iam-platform/app-secrets \
  --region us-west-2 \
  --secret-string '{
    "DB_PASSWORD": "'$(openssl rand -base64 24 | tr -d '/+=')'",
    "JWT_SECRET": "'$(openssl rand -hex 32)'",
    "JUMPCLOUD_CLIENT_ID": "<your-jumpcloud-oidc-client-id>",
    "JUMPCLOUD_CLIENT_SECRET": "<your-jumpcloud-oidc-client-secret>",
    "STS_EXTERNAL_ID": "'$(openssl rand -hex 32)'"
  }'
```

> The `STS_EXTERNAL_ID` is required for IAM policy management via STS AssumeRole.

### 2. Create the S3 Bucket for Audit Logs

```bash
aws s3 mb s3://your-audit-logs-bucket --region us-west-2

aws s3api put-bucket-encryption --bucket your-audit-logs-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

aws s3api put-public-access-block --bucket your-audit-logs-bucket \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'
```

### 3. Create IAM Role for EC2 (Platform Account)

Create an IAM role with the following policy and attach it to the EC2 instance. If the platform account itself is also a target account (i.e., you want to manage IAM policies in the same account), this role needs IAM policy management permissions as well since it will assume itself for same-account requests.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-west-2:<PLATFORM_ACCOUNT_ID>:secret:iam-platform/app-secrets*"
    },
    {
      "Sid": "AuditS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-audit-logs-bucket/*"
    },
    {
      "Sid": "AssumeRoleInTargetAccounts",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": [
        "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:role/<THIS_ROLE_NAME>",
        "arn:aws:iam::<TARGET_ACCOUNT_2>:role/iam-update-target-role"
      ]
    },
    {
      "Sid": "IAMPolicyManagement",
      "Effect": "Allow",
      "Action": [
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:ListPolicyVersions"
      ],
      "Resource": [
        "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:policy/devops-temp-access",
        "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:policy/security-temp-access",
        "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:policy/developer-temp-access"
      ]
    }
  ]
}
```

> - The `AssumeRoleInTargetAccounts` resource list must include this role's own ARN (for same-account requests) plus any external target account roles.
> - The `IAMPolicyManagement` statement is needed when the platform account is a target. For purely external accounts, this can be omitted from the EC2 role (it goes on the target account's role instead).

**Trust Policy** (allow EC2 and itself to assume the role):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:role/<THIS_ROLE_NAME>"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "<your-STS_EXTERNAL_ID-value>"
        }
      }
    }
  ]
}
```

> The second trust statement allows the role to assume itself for same-account policy updates, requiring the External ID for consistency.

### 4. Configure Target Accounts

Repeat the following steps **in each AWS account** you want to manage from this platform.

#### 4a. Create IAM Managed Policies for Each Team

These are the policies the platform will append statements to when access is approved:

```bash
# Run in the TARGET account — create one policy per team
for policy in devops-temp-access security-temp-access developer-temp-access; do
  aws iam create-policy \
    --policy-name "$policy" \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [
        {"Sid": "Placeholder", "Effect": "Allow", "Action": "none:null", "Resource": "*"}
      ]
    }'
done
```

#### 4b. Create the Cross-Account IAM Role

Create a role named `iam-update-target-role` in the target account that the platform can assume. The trust policy must reference the platform's EC2 role and require the External ID:

**Trust Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<PLATFORM_ACCOUNT_ID>:role/<EC2-Instance-Role-Name>"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "<your-STS_EXTERNAL_ID-value>"
      }
    }
  }]
}
```

**Permission Policy** (attached to the role):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowPolicyManagement",
    "Effect": "Allow",
    "Action": [
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions"
    ],
    "Resource": [
      "arn:aws:iam::<TARGET_ACCOUNT_ID>:policy/devops-temp-access",
      "arn:aws:iam::<TARGET_ACCOUNT_ID>:policy/security-temp-access",
      "arn:aws:iam::<TARGET_ACCOUNT_ID>:policy/developer-temp-access"
    ]
  }]
}
```

#### 4c. Note the Role IDs

For each IAM role in the target account that users will access secrets through, note its Role ID (starts with `AROA`). You can find it with:

```bash
aws iam get-role --role-name <role-name> --query 'Role.RoleId' --output text
```

These Role IDs go into `.env.production` as `ROLE_ID_<ROLE>_<ACCOUNT_ID>=AROA...`

### 5. Configure JumpCloud OIDC Application

1. In JumpCloud Admin Console, create an **OIDC Application**
2. Set the redirect URI to: `https://<APP_URL>/api/v1/auth/sso/callback`
3. Request scopes: `openid`, `profile`, `email`, `groups`
4. Note the **Client ID** and **Client Secret** — store them in Secrets Manager (step 1)
5. Create User Groups: `IamPlatform-Requesters`, `IamPlatform-Approvers`, `IamPlatform-Auditors`
6. Assign users to appropriate groups

### 6. Launch EC2 Instance

| Setting            | Value                                      |
|--------------------|--------------------------------------------|
| AMI                | Amazon Linux 2023 (or Ubuntu 22.04)        |
| Instance type      | **t3.small** (2 vCPU, 2 GB RAM) minimum   |
| Storage            | 20 GB gp3                                  |
| IAM Role           | Attach the role created above              |
| Security Group     | Allow **TCP 80, 443** from your internal CIDR |
| Key pair           | Your existing SSH key                      |

> **t3.small** is the minimum. For 10+ concurrent users, use **t3.medium** (4 GB RAM).

---

## Deployment (Step by Step)

### Step 1 — SSH into the Instance

```bash
ssh -i your-key.pem ec2-user@<PRIVATE-IP>
```

### Step 2 — Install Docker

**Amazon Linux 2023:**
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable docker --now
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Re-login to pick up the docker group
exit
ssh -i your-key.pem ec2-user@<PRIVATE-IP>

# Verify
docker compose version
```

**Ubuntu 22.04:**
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable docker --now
sudo usermod -aG docker ubuntu
exit
ssh -i your-key.pem ubuntu@<PRIVATE-IP>
```

### Step 3 — Clone the Repository

```bash
git clone <YOUR_REPO_URL> /home/ec2-user/iam-platform
cd /home/ec2-user/iam-platform
```

### Step 4 — Configure Environment

```bash
vi .env.production
```

Set these values (no secrets needed — they come from Secrets Manager):

```env
# Core
AWS_REGION=us-west-2
APP_SECRET_NAME=iam-platform/app-secrets
APP_URL=https://<your-domain-or-IP>
AUDIT_S3_BUCKET=your-audit-logs-bucket
AUDIT_RETENTION_DAYS=7

# SSO
JUMPCLOUD_ISSUER=https://oauth.id.jumpcloud.com/
SSO_GROUP_MAPPING=IamPlatform-Requesters:REQUESTER,IamPlatform-Approvers:APPROVER,IamPlatform-Auditors:AUDITOR

# Target Accounts (repeat block for each account)
ACCOUNT_<ACCOUNT_ID>_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/iam-update-target-role
ACCOUNT_<ACCOUNT_ID>_LABEL="Production"

# Teams per account (3 teams supported: DEVOPS, SECURITY, DEVELOPER)
TEAM_DEVOPS_<ACCOUNT_ID>_POLICY_ARN=arn:aws:iam::<ACCOUNT_ID>:policy/devops-temp-access
TEAM_SECURITY_<ACCOUNT_ID>_POLICY_ARN=arn:aws:iam::<ACCOUNT_ID>:policy/security-temp-access
TEAM_DEVELOPER_<ACCOUNT_ID>_POLICY_ARN=arn:aws:iam::<ACCOUNT_ID>:policy/developer-temp-access

# Role IDs per account (AROA... from `aws iam get-role`)
ROLE_ID_DEVOPS_L1_<ACCOUNT_ID>=AROAXXXXXXXXXXXXXXXXX
ROLE_ID_DEVOPS_L2_<ACCOUNT_ID>=AROAXXXXXXXXXXXXXXXXX
ROLE_ID_SECURITY_L1_<ACCOUNT_ID>=AROAXXXXXXXXXXXXXXXXX
ROLE_ID_DEVELOPER_<ACCOUNT_ID>=AROAXXXXXXXXXXXXXXXXX

# Slack user mapping (optional — for tagging approvers in notifications)
SLACK_USER_MAP=approver1@company.com:UXXXXXXXXXX,approver2@company.com:UYYYYYYYYYYY
```

> **Important**: Only uncommented variables with real values will be active. Accounts without `ACCOUNT_<ID>_ROLE_ARN` won't appear. Teams and roles are scoped per account — comment out any you don't want.

### Step 5 — Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
1. Validate Secrets Manager access via instance role
2. Build all Docker images
3. Fetch DB_PASSWORD from Secrets Manager (temporary tmpfs, shredded after use)
4. Start PostgreSQL with the fetched password
5. **Shred and wipe secrets from tmpfs** once postgres is healthy
6. Start the backend (fetches secrets from Secrets Manager via SDK)
7. Run database migrations
8. Start nginx (serves frontend, proxies API)
9. Run health check and print the app URL

### Step 6 — Access the Application

```
https://<EC2-IP>
```

> **Note**: The application uses a self-signed TLS certificate. Accept the browser warning on first access.

Click "Sign in with JumpCloud" — users are auto-provisioned on first login based on their JumpCloud group membership.

---

## Access Request Flow

```
1. User signs in via JumpCloud SSO
2. Selects Target Account (mandatory — only configured accounts shown)
3. Selects Team (only teams configured for that account shown)
4. Selects Role Level (only levels configured for that team + account)
5. Chooses "Specific Secrets" or "All Secrets" scope
6. Specifies Secret ARNs (if specific), Actions, Duration (hours or 30 minutes)
7. Provides justification and submits

8. Approver sees request in queue
9. Clicks Approve → views two-panel policy diff (current vs proposed)
10. Confirms approval (dual approval required for "All Secrets")

11. Platform assumes role in target account via STS (External ID from Secrets Manager)
12. IAM managed policy is updated via CreatePolicyVersion
13. New statement appended with time-bound + userid conditions
14. Access auto-expires when DateLessThan condition passes
```

---

## Security Model

### Secrets Handling

| Secret | Storage | Access Method |
|--------|---------|---------------|
| DB_PASSWORD | AWS Secrets Manager | SDK call via instance role |
| JWT_SECRET | AWS Secrets Manager | SDK call via instance role (5 min cache) |
| JUMPCLOUD_CLIENT_ID | AWS Secrets Manager | SDK call via instance role |
| JUMPCLOUD_CLIENT_SECRET | AWS Secrets Manager | SDK call via instance role |
| STS_EXTERNAL_ID | AWS Secrets Manager | SDK call via instance role (5 min cache) |

- **No secrets on disk** — ever. Not in `.env`, not in docker-compose, not in any file.
- **tmpfs volume** holds the DB password only during postgres initialization, then it is `shred`-ed and deleted.
- **JWT_SECRET** is fetched live from Secrets Manager with a 5-minute in-memory cache.
- **Instance role** provides all AWS access — no access keys configured anywhere.

### IAM Policy Management

- All policy updates go through STS AssumeRole into the target account
- Policies are updated using `iam:CreatePolicyVersion` with `SetAsDefault: true`
- Old non-default versions are automatically cleaned up (IAM limit: 5 versions)
- Policy size is validated before applying (max 6144 bytes)
- Statements are **appended** — existing statements are never removed or overwritten
- STS sessions are cached for 50 minutes to minimize API calls

### Application Security Hardening

- **Backend runs as non-root** — Container uses a dedicated `appuser` with limited permissions
- **CSP and security headers** — Strict Content-Security-Policy, X-Frame-Options DENY, HSTS, Permissions-Policy on all responses
- **SSRF protection** — Slack webhook URLs restricted to `hooks.slack.com` domains only
- **Atomic state transitions** — All status changes (approve/reject/revoke) use atomic DB operations to prevent race conditions
- **JWT algorithm pinning** — Tokens verified with `HS256` only (prevents algorithm confusion attacks)
- **Input validation** — All endpoints use Zod schemas with length limits; backend rejects unknown fields
- **Access log redaction** — SSO callback tokens/codes are redacted from morgan access logs
- **Hidden file blocking** — Nginx denies access to `.git`, `.env`, and other dotfiles
- **SSO flood protection** — Pending SSO flows capped at 1000 to prevent memory exhaustion
- **Deactivated user enforcement** — SSO login blocked for deactivated users (admin can deactivate via DB)

### Audit Log Retention

| Retention | Location | Purpose |
|-----------|----------|---------|
| 7 days | PostgreSQL (platform DB) | Live querying in the UI |
| Permanent | S3 bucket (encrypted) | Long-term compliance archive |

- Archives run daily at 01:00 UTC, cleanup at 02:00 UTC
- Logs are archived to S3 as JSON day-wise, then deleted from the database
- S3 objects use AES256 server-side encryption
- Audit logs include **requester justification** and **approver notes** for compliance

### Data Persistence

| Data | Survives Restart | Survives `docker compose down` | Survives `docker compose down -v` |
|------|-----------------|-------------------------------|----------------------------------|
| PostgreSQL data | Yes | Yes | **No** (volume deleted) |
| Secrets in tmpfs | No (wiped after startup) | No | No |
| Audit archives | N/A (in S3) | N/A | N/A |

---

## Day-to-Day Operations

```bash
cd /home/ec2-user/iam-platform

# View live logs
docker compose logs -f

# View just backend logs
docker compose logs -f backend

# Restart all services (data preserved)
docker compose restart

# Stop everything (data preserved in pgdata volume)
docker compose down

# Start again (secrets re-fetched from Secrets Manager)
docker compose --env-file .env.production up -d

# Full rebuild after code changes
git pull
docker compose --env-file .env.production up -d --build

# Open a psql shell
docker compose exec postgres psql -U postgres -d iam_access_platform
```

### Adding/Removing Accounts, Teams or Roles

To add a new target account, or enable/disable teams and roles, edit `.env.production` and restart:

```bash
vi .env.production
# Add new ACCOUNT_* lines, or comment out/uncomment TEAM_*/ROLE_ID_* lines

# Restart backend to pick up changes
docker compose restart backend
```

No code changes or rebuilds required.

---

## Backup & Restore

```bash
# Backup database
docker compose exec -T postgres \
  pg_dump -U postgres iam_access_platform | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c backup_20260610.sql.gz | \
  docker compose exec -T postgres psql -U postgres -d iam_access_platform
```

---

## Post-Deployment Checklist

- [ ] App responds at `https://<EC2-IP>` (HTTP 200 on `/api/v1/health`)
- [ ] SSO login works — "Sign in with JumpCloud" redirects and returns
- [ ] User is provisioned with correct roles based on JumpCloud groups
- [ ] Only configured accounts appear in the "New Request" form
- [ ] Only configured teams appear for each account
- [ ] Only configured role levels appear for each team + account
- [ ] `secrets-cleanup` container exited: `docker inspect iam-platform-secrets-cleanup`
- [ ] No secret files remain: `docker run --rm -v secretmanager-access_secrets:/s alpine ls /s`
- [ ] Backend logs show "Secrets loaded successfully from Secrets Manager"
- [ ] Submitting a request works end-to-end
- [ ] Approver can see policy diff and approve
- [ ] Audit logs are created (check `/audit` page)

---

## Rotating Secrets

### Rotate JWT_SECRET (zero downtime)

1. Update the secret in Secrets Manager:
   ```bash
   aws secretsmanager put-secret-value --secret-id iam-platform/app-secrets \
     --secret-string '{"DB_PASSWORD":"<existing>","JWT_SECRET":"<new-value>","JUMPCLOUD_CLIENT_ID":"<existing>","JUMPCLOUD_CLIENT_SECRET":"<existing>"}'
   ```
2. The backend picks up the new value within 5 minutes.
3. Existing tokens signed with the old secret will fail — users re-login via SSO.

### Rotate DB_PASSWORD (requires restart)

1. Update the secret in Secrets Manager with the new password.
2. Change the password in PostgreSQL:
   ```bash
   docker compose exec postgres psql -U postgres -c "ALTER USER postgres PASSWORD '<new-password>';"
   ```
3. Restart the backend:
   ```bash
   docker compose restart backend
   ```

---

## EC2 Security Group Rules

| Type  | Port | Source                         | Description    |
|-------|------|--------------------------------|----------------|
| SSH   | 22   | Your VPN / bastion SG          | Admin access   |
| HTTP  | 80   | Internal CIDR (e.g. 10.0.0.0/8) | App access   |
| HTTPS | 443  | Outbound (0.0.0.0/0)          | AWS API access |

**Do NOT** open port 80 to `0.0.0.0/0`. Keep it restricted to your internal network or VPN CIDR.

---

## Resource Sizing Guide

| Team Size   | Instance Type | RAM  | Storage | Monthly Cost (approx) |
|-------------|---------------|------|---------|----------------------|
| 1–10 users  | t3.small      | 2 GB | 20 GB   | ~$15                 |
| 10–30 users | t3.medium     | 4 GB | 30 GB   | ~$30                 |
| 30–50 users | t3.large      | 8 GB | 50 GB   | ~$60                 |

---

## Application Pages

| Route             | Role Access          | Description                           |
|-------------------|----------------------|---------------------------------------|
| `/login`          | Public               | SSO login page                        |
| `/sso/callback`   | Public               | SSO callback handler                  |
| `/dashboard`      | All authenticated    | Stats, expiring grants, activity feed |
| `/requests/new`   | Requester/Approver   | Multi-step access request wizard      |
| `/requests`       | All authenticated    | Request list with filters             |
| `/requests/:id`   | Owner or Approver    | Request detail, policy view, timeline |
| `/admin/requests` | Approver             | Approval queue with policy diff       |
| `/admin/users`    | Approver             | User management table                 |
| `/audit`          | Approver/Auditor     | Full audit log with filters           |
| `/settings`       | All authenticated    | Profile and security settings         |
| `/admin/slack`    | Approver             | Slack webhook and notification settings |

## API Endpoints

| Method | Path                               | Auth        | Description                    |
|--------|--------------------------------------|-------------|--------------------------------|
| GET    | `/api/v1/auth/sso/login`            | None        | Initiate SSO login             |
| GET    | `/api/v1/auth/sso/callback`         | None        | SSO callback (JumpCloud)       |
| POST   | `/api/v1/auth/refresh`              | Refresh JWT | Refresh access token           |
| GET    | `/api/v1/auth/me`                   | JWT         | Get current user profile       |
| POST   | `/api/v1/auth/switch-role`          | JWT         | Switch active role             |
| GET    | `/api/v1/teams`                     | JWT         | List configured teams          |
| GET    | `/api/v1/teams/:id/role-levels`     | JWT         | List role levels for a team    |
| GET    | `/api/v1/accounts`                  | JWT         | List configured target accounts |
| GET    | `/api/v1/accounts/:id/teams`        | JWT         | Teams for a target account     |
| GET    | `/api/v1/accounts/:id/teams/:t/role-levels` | JWT | Role levels for account team   |
| POST   | `/api/v1/requests`                  | JWT         | Submit access request          |
| GET    | `/api/v1/requests`                  | JWT         | List requests (filtered)       |
| GET    | `/api/v1/requests/stats`            | JWT         | Dashboard statistics           |
| GET    | `/api/v1/requests/:id`              | JWT         | Request details + audit trail  |
| GET    | `/api/v1/requests/:id/policy-preview` | Approver  | Policy diff (current vs proposed) |
| PATCH  | `/api/v1/requests/:id/approve`      | Approver    | Approve (applies IAM policy)   |
| PATCH  | `/api/v1/requests/:id/reject`       | Approver    | Reject with notes              |
| DELETE | `/api/v1/requests/:id`              | Approver    | Revoke active grant            |
| GET    | `/api/v1/audit`                     | Approver/Auditor | Query audit logs          |
| GET    | `/api/v1/admin/users`               | Approver    | List all users                 |
| GET    | `/api/v1/admin/requests`            | Approver    | Admin request view             |
| GET    | `/api/v1/settings`                  | Approver    | Get Slack/app settings         |
| PUT    | `/api/v1/settings`                  | Approver    | Update Slack/app settings      |
| POST   | `/api/v1/settings/test-slack`       | Approver    | Test Slack webhook connectivity|
| GET    | `/api/v1/health`                    | None        | Health check                   |

---

## Project Structure

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database models
│   │   └── migrations/            # SQL migrations
│   ├── src/
│   │   ├── index.ts               # Bootstrap: fetch secrets → start app
│   │   ├── app.ts                 # Express config + route registration
│   │   ├── scheduler.ts           # Cron jobs (audit archival + cleanup)
│   │   ├── config/
│   │   │   ├── teams.ts           # Team & role level config (from env)
│   │   │   └── accounts.ts        # Cross-account config + External ID from SM
│   │   ├── middleware/            # Auth (JWT), error handling
│   │   ├── routes/
│   │   │   ├── sso.ts            # JumpCloud OIDC login/callback
│   │   │   ├── auth.ts           # Refresh, me, switch-role
│   │   │   ├── requests.ts       # CRUD + policy-preview
│   │   │   ├── teams.ts          # GET teams + role-levels
│   │   │   ├── accounts.ts      # Cross-account targets
│   │   │   ├── audit.ts          # Audit log queries
│   │   │   ├── admin.ts          # Admin views
│   │   │   └── health.ts         # Health check
│   │   ├── services/
│   │   │   ├── audit.service.ts           # Audit log CRUD
│   │   │   ├── audit-retention.service.ts # S3 archival + DB cleanup
│   │   │   ├── request.service.ts         # Access request + dual approval
│   │   │   ├── policy.service.ts          # Statement generation (aws:userid)
│   │   │   ├── iam-policy.service.ts      # AWS IAM API (read/append/apply)
│   │   │   └── slack.service.ts           # Slack notifications + approver tagging
│   │   ├── validators/            # Zod schemas
│   │   └── utils/
│   │       ├── secrets.ts         # Secrets Manager client (live fetch)
│   │       ├── s3.ts              # S3 client for audit archival
│   │       ├── prisma.ts          # Prisma client
│   │       └── logger.ts          # Winston logger
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/ui/         # Button, Card, Badge, Modal, Input
│   │   ├── components/layout/     # Sidebar, AppLayout
│   │   ├── pages/                 # All route pages
│   │   ├── context/               # Auth context (SSO)
│   │   ├── lib/                   # API client, utilities
│   │   └── types/                 # TypeScript types
│   ├── nginx.conf                 # Reverse proxy config
│   └── Dockerfile
├── docker-compose.yml             # All services
├── .env.production                # Non-secret config (teams, roles, SSO)
├── deploy.sh                      # One-command deploy script
└── README.md
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `secrets-init` exits with error | Instance role can't access Secrets Manager | Verify IAM role is attached and has `secretsmanager:GetSecretValue` permission |
| Backend crashes on startup | Can't reach Secrets Manager | Check security group allows outbound HTTPS (443) to AWS services |
| `POSTGRES_PASSWORD_FILE` error | secrets-cleanup ran before postgres read the file | This shouldn't happen (dependency ordering). Restart: `docker compose up -d` |
| No accounts in request form | No `ACCOUNT_*_ROLE_ARN` configured | Add `ACCOUNT_<ID>_ROLE_ARN` and `ACCOUNT_<ID>_LABEL` to `.env.production` and restart |
| No teams for an account | `TEAM_<TEAM>_<ACCOUNT_ID>_POLICY_ARN` not set | Add policy ARN for that team+account and restart backend |
| No role levels shown | `ROLE_ID_<ROLE>_<ACCOUNT_ID>` not set | Add role ID for that role+account and restart backend |
| SSO login fails | JumpCloud app misconfigured | Verify redirect URI, client ID/secret in Secrets Manager, and JUMPCLOUD_ISSUER |
| User gets wrong role (e.g., always REQUESTER) | JumpCloud not sending `groups` claim | Ensure "Include Group Attribute" is checked in JumpCloud SSO tab, groups are bound in the "User Groups" tab, and the user is a member of the correct group. Check backend logs for `SSO id_token` and `SSO userinfo` to see what claims are received |
| Policy apply fails | Instance role missing IAM permissions | Add `iam:CreatePolicyVersion` etc. for the team policy ARNs |
| Audit archival fails | S3 bucket doesn't exist or no permissions | Verify bucket exists and IAM role has `s3:PutObject` on the bucket |
| JWT errors after secret rotation | Old tokens signed with previous secret | Expected — users re-login via SSO. New tokens use the updated secret within 5 minutes |
| "Policy exceeds size limit" | Too many statements in the managed policy | Clean up expired statements from the policy, or split into multiple policies |
