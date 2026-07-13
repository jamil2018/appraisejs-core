-- Template Steps and Template Step Groups are a shared library. Consolidate any
-- same-name groups that were temporarily split by project ownership, then detach
-- the surviving groups from TargetProject while retaining the nullable column as
-- a compatibility seam for databases created during the staged ownership rollout.
UPDATE "TemplateStep"
SET "templateStepGroupId" = (
  SELECT MIN(canonical."id")
  FROM "TemplateStepGroup" AS canonical
  WHERE canonical."name" = (
    SELECT current_group."name"
    FROM "TemplateStepGroup" AS current_group
    WHERE current_group."id" = "TemplateStep"."templateStepGroupId"
  )
)
WHERE "templateStepGroupId" IN (
  SELECT duplicate."id"
  FROM "TemplateStepGroup" AS duplicate
  WHERE duplicate."id" <> (
    SELECT MIN(canonical."id")
    FROM "TemplateStepGroup" AS canonical
    WHERE canonical."name" = duplicate."name"
  )
);

DELETE FROM "TemplateStepGroup"
WHERE "id" <> (
  SELECT MIN(canonical."id")
  FROM "TemplateStepGroup" AS canonical
  WHERE canonical."name" = "TemplateStepGroup"."name"
);

UPDATE "TemplateStepGroup" SET "targetProjectId" = NULL;

DROP INDEX IF EXISTS "TemplateStepGroup_targetProjectId_name_key";
CREATE UNIQUE INDEX "TemplateStepGroup_name_key" ON "TemplateStepGroup"("name");
