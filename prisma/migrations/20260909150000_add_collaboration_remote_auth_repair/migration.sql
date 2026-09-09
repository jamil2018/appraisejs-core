-- Authentication failures are durable repair boundaries, not a zero-delay
-- scheduler retry. Preserve the last sanitized failure reason for the local
-- repair surface without storing credentials or remote output.
ALTER TABLE "CollaborationBinding" ADD COLUMN "remoteAuthRepairRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CollaborationBinding" ADD COLUMN "remoteCheckError" TEXT;
