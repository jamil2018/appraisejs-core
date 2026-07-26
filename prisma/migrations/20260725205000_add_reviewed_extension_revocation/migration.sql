ALTER TABLE "StepReviewedExtension" ADD COLUMN "revokedAt" DATETIME;
ALTER TABLE "StepReviewedExtension" ADD COLUMN "revokedBy" TEXT;
ALTER TABLE "StepReviewedExtension" ADD COLUMN "revocationReason" TEXT;
CREATE INDEX "StepReviewedExtension_revokedAt_idx" ON "StepReviewedExtension"("revokedAt");
