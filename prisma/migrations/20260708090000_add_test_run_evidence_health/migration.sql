ALTER TABLE "TestRun" ADD COLUMN "evidenceHealth" TEXT NOT NULL DEFAULT 'invalid_missing_report';
CREATE INDEX "TestRun_evidenceHealth_idx" ON "TestRun"("evidenceHealth");
