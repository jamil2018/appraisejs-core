-- Retained C0.2e external Analyzer admission. Existing authorization and
-- attempt rows retain their managed semantics through nullable provenance and
-- the MANAGED default; no historical Factory receipt is reinterpreted.
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "externalAdmissionProtocol" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "externalPrincipalId" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "externalPrincipalAssurance" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "externalOptInRequestHash" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "externalOptedInAt" DATETIME;

ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'MANAGED';
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalPrincipalId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalPrincipalAssurance" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "assignmentGeneration" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmissionId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmissionJson" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmissionHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmissionRequestHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmittedAt" DATETIME;

CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_externalAdmissionId_key"
ON "QualityJourneyWorkAttempt"("externalAdmissionId");
