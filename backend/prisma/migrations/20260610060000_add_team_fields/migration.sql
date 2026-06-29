-- AlterTable: Add roles array to users
ALTER TABLE "users" ADD COLUMN "roles" "Role"[] DEFAULT ARRAY['REQUESTER']::"Role"[];
ALTER TABLE "users" ALTER COLUMN "password" SET DEFAULT '';

-- AlterTable: Add team-based fields to access_requests
ALTER TABLE "access_requests" ADD COLUMN "team" TEXT;
ALTER TABLE "access_requests" ADD COLUMN "roleLevel" TEXT;
ALTER TABLE "access_requests" ADD COLUMN "accessScope" TEXT NOT NULL DEFAULT 'specific';
ALTER TABLE "access_requests" ADD COLUMN "approvalsRequired" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "access_requests" ADD COLUMN "approvals" JSONB[] DEFAULT ARRAY[]::JSONB[];

-- CreateIndex
CREATE INDEX "access_requests_team_idx" ON "access_requests"("team");
