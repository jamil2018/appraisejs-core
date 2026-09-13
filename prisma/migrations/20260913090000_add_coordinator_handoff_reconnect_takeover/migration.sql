-- C1.3 reconnect/takeover records bind a coordinator session to one exact
-- Journey projection.  Existing C1.2 handoffs remain readable, but cannot be
-- reinterpreted as an approved later-stage takeover because snapshot and
-- approval fields are intentionally nullable for historical rows.
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "journeyStateHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "journeyStage" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "revisionSnapshotHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "workSnapshotHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "eventSequence" INTEGER;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "targetReferenceHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "coordinatorTaskId" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverApprovalHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverApprovalExpiresAt" DATETIME;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverRequestHash" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverResultJson" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverApprovedAt" DATETIME;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverApprovedBy" TEXT;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "takeoverAt" DATETIME;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "fencedAt" DATETIME;
ALTER TABLE "QualityJourneyCoordinatorHandoff" ADD COLUMN "fenceReason" TEXT;

CREATE INDEX "QualityJourneyCoordinatorHandoff_journeyId_takeoverAt_idx"
ON "QualityJourneyCoordinatorHandoff"("journeyId", "takeoverAt");

-- Historical C1.2 rows predate coordinator generations. Assign deterministic
-- per-target generations before enforcing the C1.3 uniqueness invariant.
WITH "ranked_handoffs" AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "journeyId", "targetProjectId" ORDER BY "createdAt", "id"
  ) AS "nextGeneration"
  FROM "QualityJourneyCoordinatorHandoff"
)
UPDATE "QualityJourneyCoordinatorHandoff"
SET "generation" = (
  SELECT "nextGeneration" FROM "ranked_handoffs"
  WHERE "ranked_handoffs"."id" = "QualityJourneyCoordinatorHandoff"."id"
);

CREATE UNIQUE INDEX "QualityJourneyCoordinatorHandoff_journeyId_targetProjectId_generation_key"
ON "QualityJourneyCoordinatorHandoff"("journeyId", "targetProjectId", "generation");
