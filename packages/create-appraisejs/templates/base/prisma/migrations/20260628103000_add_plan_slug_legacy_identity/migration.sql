ALTER TABLE "PlanProjection" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanProjection" ADD COLUMN "legacyPlanId" TEXT;

UPDATE "PlanProjection"
SET
  "slug" = "planId",
  "legacyPlanId" = "planId"
WHERE "slug" IS NULL;

UPDATE "PlanProjection"
SET
  "slug" = "planId",
  "legacyPlanId" = "planId"
WHERE "slug" = '';

CREATE INDEX "PlanProjection_slug_idx" ON "PlanProjection"("slug");
CREATE INDEX "PlanProjection_legacyPlanId_idx" ON "PlanProjection"("legacyPlanId");
