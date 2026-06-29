#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  IAM Access Platform — Single EC2 Deploy Script
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Pre-flight checks ----
command -v docker >/dev/null 2>&1  || err "Docker is not installed. Run the EC2 setup steps first."
docker compose version >/dev/null 2>&1 || err "Docker Compose v2 is required."

# ---- Load env file ----
ENV_FILE=".env.production"
if [ ! -f "$ENV_FILE" ]; then
  err "$ENV_FILE not found. Create it with AWS_REGION, APP_SECRET_NAME, APP_URL, AUDIT_S3_BUCKET."
fi

# ---- Export env vars ----
set -a
source "$ENV_FILE"
set +a

# ---- Validate Secrets Manager access ----
log "Validating access to Secrets Manager..."
SECRET_NAME="${APP_SECRET_NAME:-iam-platform/app-secrets}"
REGION="${AWS_REGION:-us-west-2}"

# ---- Write secrets to volume ----
log "Fetching secrets from Secrets Manager and writing to volume..."
docker volume create secretmanager-access_secrets 2>/dev/null || true

docker run --rm \
  --entrypoint /bin/sh \
  -v secretmanager-access_secrets:/run/secrets \
  amazon/aws-cli:latest \
  -c "
    set -e
    SECRET=\$(aws secretsmanager get-secret-value --secret-id '$SECRET_NAME' --region '$REGION' --query 'SecretString' --output text)
    echo \"\$SECRET\" | sed -n 's/.*\"DB_PASSWORD\":\"\([^\"]*\)\".*/\1/p' > /run/secrets/db_password
    echo \"\$SECRET\" | sed -n 's/.*\"JWT_SECRET\":\"\([^\"]*\)\".*/\1/p' > /run/secrets/jwt_secret
    echo 'Secrets written successfully.'
    ls -la /run/secrets/
  "

# Verify files exist
docker run --rm -v secretmanager-access_secrets:/run/secrets alpine test -s /run/secrets/db_password \
  || err "db_password file is empty or missing. Check Secrets Manager content."

log "Secrets written to volume."

# ---- Build & Deploy ----
log "Building containers..."
docker compose build --no-cache

log "Starting services..."
docker compose --env-file "$ENV_FILE" up -d

log "Waiting for database to be healthy..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    log "Database is healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "Database did not become healthy within 60 seconds."
  fi
  sleep 2
done

# ---- Cleanup secrets from volume ----
log "Cleaning up secrets from volume..."
docker run --rm -v secretmanager-access_secrets:/run/secrets alpine sh -c "
  rm -f /run/secrets/db_password /run/secrets/jwt_secret
  echo 'Secrets removed from volume.'
"

log "Backend will run migrations on startup automatically."

# ---- Health check ----
sleep 5
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost/api/v1/health 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  log "============================================"
  log "  Deployment successful!"
  log "============================================"
  log ""
  log "  App URL:  ${APP_URL:-https://localhost}"
  log ""
  log "  Users authenticate via JumpCloud SSO."
  log "  Ensure JumpCloud redirect URI is set to:"
  log "    ${APP_URL:-https://localhost}/api/v1/auth/sso/callback"
  log ""
  log "  Manage:  docker compose logs -f"
  log "  Stop:    docker compose down"
  log "  Restart: docker compose --env-file .env.production up -d"
  log "============================================"
else
  warn "Health check returned HTTP $HTTP_CODE."
  warn "Services may still be starting. Check: docker compose --env-file .env.production logs backend"
fi
