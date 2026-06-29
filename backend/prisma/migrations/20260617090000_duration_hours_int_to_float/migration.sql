-- AlterTable: change durationHours from INTEGER to DOUBLE PRECISION
ALTER TABLE "access_requests" ALTER COLUMN "durationHours" SET DATA TYPE DOUBLE PRECISION;
