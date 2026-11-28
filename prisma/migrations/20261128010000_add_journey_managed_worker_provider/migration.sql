ALTER TABLE "QualityJourney"
ADD COLUMN "managedWorkerProvider" TEXT NOT NULL DEFAULT 'CODEX'
CHECK ("managedWorkerProvider" IN ('CODEX', 'CLAUDE_CODE'));

ALTER TABLE "QualityJourneyDraft"
ADD COLUMN "managedWorkerProvider" TEXT NOT NULL DEFAULT 'CODEX'
CHECK ("managedWorkerProvider" IN ('CODEX', 'CLAUDE_CODE'));

ALTER TABLE "QualityJourneyWorkAttempt"
ADD COLUMN "managedDispatchIdentityJson" TEXT;
