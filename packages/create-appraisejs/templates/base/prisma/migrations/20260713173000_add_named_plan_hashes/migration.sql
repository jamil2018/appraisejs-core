ALTER TABLE "PlanProjection" ADD COLUMN "planContentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanProjection" ADD COLUMN "planStateHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanProjection" ADD COLUMN "reviewBindingHash" TEXT NOT NULL DEFAULT '';

ALTER TABLE "PlanEvent" ADD COLUMN "previousStateHash" TEXT;
ALTER TABLE "PlanEvent" ADD COLUMN "stateHash" TEXT;
ALTER TABLE "PlanEvent" ADD COLUMN "planContentHash" TEXT;
ALTER TABLE "PlanEvent" ADD COLUMN "revision" INTEGER;
ALTER TABLE "PlanEvent" ADD COLUMN "actor" TEXT;
