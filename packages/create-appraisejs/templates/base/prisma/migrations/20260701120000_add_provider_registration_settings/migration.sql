-- AlterTable
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "executablePath" TEXT;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "detectedVersion" TEXT;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "probeStatus" TEXT NOT NULL DEFAULT 'not_probed';
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "probeMessage" TEXT;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "lastProbedAt" DATETIME;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "defaultProfile" TEXT;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "defaultModel" TEXT;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "launchEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProviderAdapterRegistration" ADD COLUMN "settingsJson" TEXT;

-- CreateIndex
CREATE INDEX "ProviderAdapterRegistration_enabled_launchEnabled_probeStatus_idx" ON "ProviderAdapterRegistration"("enabled", "launchEnabled", "probeStatus");
