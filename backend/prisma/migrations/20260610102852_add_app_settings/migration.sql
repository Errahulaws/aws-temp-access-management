-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "slackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "slackWebhookUrl" TEXT,
    "slackChannel" TEXT,
    "slackNotifyOnCreate" BOOLEAN NOT NULL DEFAULT true,
    "slackNotifyOnApprove" BOOLEAN NOT NULL DEFAULT true,
    "slackNotifyOnReject" BOOLEAN NOT NULL DEFAULT true,
    "slackNotifyOnRevoke" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
