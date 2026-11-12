-- Persist the hosting contract floor so older application packages refuse
-- storage whose coordinator authority semantics they cannot enforce.
ALTER TABLE "QualityJourney" ADD COLUMN "hostingContractVersion" INTEGER NOT NULL DEFAULT 1;
