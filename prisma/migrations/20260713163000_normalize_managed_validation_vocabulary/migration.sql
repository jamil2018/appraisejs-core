UPDATE "PlanProjection"
SET "validationJson" = replace(replace("validationJson", 'phase2_review_only', 'reviewed_publication'), 'phase3_capsule', 'runtime_capsule')
WHERE "validationJson" IS NOT NULL;

UPDATE "ValidationAstPublishOperation"
SET "projectionJson" = replace(replace("projectionJson", 'phase2_review_only', 'reviewed_publication'), 'phase3_capsule', 'runtime_capsule'),
    "runtimeInputJson" = replace(replace("runtimeInputJson", 'phase2_review_only', 'reviewed_publication'), 'phase3_capsule', 'runtime_capsule')
WHERE "projectionJson" LIKE '%phase2_review_only%'
   OR "projectionJson" LIKE '%phase3_capsule%'
   OR "runtimeInputJson" LIKE '%phase2_review_only%'
   OR "runtimeInputJson" LIKE '%phase3_capsule%';
