-- This migration is intentionally guarded by the canonical migration runner's
-- transaction. Legacy decision events are only translated when each durable
-- identity can be proven from its original publication operation and payload.
CREATE TABLE "__WorkflowReliabilityMigrationGuard" (
  "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);

INSERT INTO "__WorkflowReliabilityMigrationGuard" ("ok")
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM "PlanEvent" AS event
  LEFT JOIN "ValidationAstPublishOperation" AS operation
    ON operation."id" = event."publishOperationId"
  WHERE event."type" = 'validation_node_decided'
    AND (
      event."publishOperationId" IS NULL
      OR event."validationId" IS NULL
      OR event."payloadJson" IS NULL
      OR json_valid(event."payloadJson") <> 1
      OR operation."id" IS NULL
      OR operation."runtimeInputHash" IS NULL
      OR length(operation."runtimeInputHash") = 0
      OR length(operation."projectionHash") = 0
      OR operation."validationProjectionJson" IS NULL
      OR json_valid(operation."validationProjectionJson") <> 1
      OR NOT EXISTS (
        SELECT 1
        FROM json_each(operation."validationProjectionJson", '$.validations') AS validation
        WHERE json_extract(validation."value", '$.id') = event."validationId"
          AND json_extract(validation."value", '$.astProvenance.schemaVersion') = '2'
          AND json_extract(validation."value", '$.astProvenance.publishOperationId') = operation."id"
      )
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_extract(event."payloadJson", '$.validationId')
        ELSE NULL
      END <> event."validationId"
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_extract(event."payloadJson", '$.operationHash')
        ELSE NULL
      END <> operation."operationHash"
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_type(event."payloadJson", '$.contentHash')
        ELSE NULL
      END <> 'text'
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN length(json_extract(event."payloadJson", '$.contentHash'))
        ELSE 0
      END = 0
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_type(event."payloadJson", '$.decision')
        ELSE NULL
      END <> 'text'
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_type(event."payloadJson", '$.decidedBy')
        ELSE NULL
      END <> 'text'
      OR CASE
        WHEN json_valid(event."payloadJson") = 1
          THEN json_type(event."payloadJson", '$.decidedAt')
        ELSE NULL
      END <> 'text'
    )
) OR EXISTS (
  SELECT 1
  FROM "PlanEvent"
  WHERE "type" = 'validation_node_decided'
  GROUP BY "publishOperationId", "validationId"
  HAVING count(*) <> 1
) OR EXISTS (
  SELECT 1
  FROM "ValidationAstPublishOperation" AS operation
  WHERE operation."phase" = 'review_ready'
    AND (
      operation."runtimeInputHash" IS NULL
      OR length(operation."runtimeInputHash") = 0
      OR length(operation."projectionHash") = 0
      OR operation."validationProjectionJson" IS NULL
      OR json_valid(operation."validationProjectionJson") <> 1
    )
) OR EXISTS (
  SELECT 1
  FROM "ValidationAstPublishOperation" AS operation
  JOIN json_each(operation."validationProjectionJson", '$.validations') AS validation
  WHERE operation."phase" = 'review_ready'
    AND json_valid(operation."validationProjectionJson") = 1
    AND json_extract(validation."value", '$.astProvenance.schemaVersion') = '2'
    AND json_extract(validation."value", '$.astProvenance.publishOperationId') = operation."id"
    AND NOT EXISTS (
      SELECT 1
      FROM "PlanEvent" AS event
      WHERE event."type" = 'validation_node_decided'
        AND event."publishOperationId" = operation."id"
        AND event."validationId" = json_extract(validation."value", '$.id')
    )
) THEN 0 ELSE 1 END;

DROP TABLE "__WorkflowReliabilityMigrationGuard";

ALTER TABLE "PlanEvent" ADD COLUMN "operationEventKey" TEXT;
ALTER TABLE "PlanOperationMetric" ADD COLUMN "estimatedTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlanOperationMetric" ADD COLUMN "responseMode" TEXT NOT NULL DEFAULT 'summary';
ALTER TABLE "PlanOperationMetric" ADD COLUMN "retryCause" TEXT;
ALTER TABLE "PlanOperationMetric" ADD COLUMN "classification" TEXT;
ALTER TABLE "PlanOperationMetric" ADD COLUMN "operationOutcome" TEXT;

CREATE UNIQUE INDEX "PlanEvent_operationEventKey_key" ON "PlanEvent"("operationEventKey");

CREATE TABLE "ValidationNodePublication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "validationId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "publishOperationId" TEXT NOT NULL,
  "operationHash" TEXT NOT NULL,
  "runtimeInputHash" TEXT NOT NULL,
  "projectionHash" TEXT NOT NULL,
  "publicationHash" TEXT NOT NULL,
  "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationNodePublication_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanProjection" ("planId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ValidationNodePublication_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ValidationNodePublication_publishOperationId_fkey" FOREIGN KEY ("publishOperationId") REFERENCES "ValidationAstPublishOperation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ValidationNodePublication_publishOperationId_validationId_key"
ON "ValidationNodePublication"("publishOperationId", "validationId");
CREATE UNIQUE INDEX "ValidationNodePublication_planId_targetProjectId_validationId_contentHash_publishOperationId_operationHash_runtimeInputHash_projectionHash_key"
ON "ValidationNodePublication"("planId", "targetProjectId", "validationId", "contentHash", "publishOperationId", "operationHash", "runtimeInputHash", "projectionHash");
CREATE UNIQUE INDEX "ValidationNodePublication_publicationHash_key" ON "ValidationNodePublication"("publicationHash");
CREATE INDEX "ValidationNodePublication_planId_validationId_publishedAt_idx"
ON "ValidationNodePublication"("planId", "validationId", "publishedAt");
CREATE INDEX "ValidationNodePublication_targetProjectId_validationId_publishedAt_idx"
ON "ValidationNodePublication"("targetProjectId", "validationId", "publishedAt");

CREATE TABLE "ValidationDecisionReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicationId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "decidedBy" TEXT NOT NULL,
  "decidedAt" DATETIME NOT NULL,
  "requestHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  CONSTRAINT "ValidationDecisionReceipt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "ValidationNodePublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ValidationDecisionReceipt_publicationId_key" ON "ValidationDecisionReceipt"("publicationId");
CREATE UNIQUE INDEX "ValidationDecisionReceipt_publicationId_idempotencyKey_key"
ON "ValidationDecisionReceipt"("publicationId", "idempotencyKey");
CREATE UNIQUE INDEX "ValidationDecisionReceipt_receiptHash_key" ON "ValidationDecisionReceipt"("receiptHash");

CREATE TABLE "CoordinatorFailureReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schemaVersion" TEXT NOT NULL,
  "errorId" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "classification" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "operationName" TEXT NOT NULL,
  "planId" TEXT,
  "idempotencyKeyHash" TEXT,
  "phase" TEXT,
  "operationOutcome" TEXT,
  "retryStrategy" TEXT,
  "scrubbedDetailsJson" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  CONSTRAINT "CoordinatorFailureReceipt_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanProjection" ("planId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CoordinatorFailureReceipt_errorId_key" ON "CoordinatorFailureReceipt"("errorId");
CREATE UNIQUE INDEX "CoordinatorFailureReceipt_receiptHash_key" ON "CoordinatorFailureReceipt"("receiptHash");
CREATE INDEX "CoordinatorFailureReceipt_planId_occurredAt_idx" ON "CoordinatorFailureReceipt"("planId", "occurredAt");
CREATE INDEX "CoordinatorFailureReceipt_operationName_occurredAt_idx" ON "CoordinatorFailureReceipt"("operationName", "occurredAt");

CREATE TABLE "CoordinatorOperationReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationName" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestJson" TEXT NOT NULL,
  "resultHash" TEXT,
  "resultJson" TEXT,
  "phase" TEXT NOT NULL,
    "operationOutcome" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "planId" TEXT,
  CONSTRAINT "CoordinatorOperationReceipt_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanProjection" ("planId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CoordinatorOperationReceipt_operationName_scopeKey_idempotencyKey_key"
ON "CoordinatorOperationReceipt"("operationName", "scopeKey", "idempotencyKey");
CREATE INDEX "CoordinatorOperationReceipt_planId_startedAt_idx" ON "CoordinatorOperationReceipt"("planId", "startedAt");
CREATE INDEX "CoordinatorOperationReceipt_operationName_startedAt_idx"
ON "CoordinatorOperationReceipt"("operationName", "startedAt");

ALTER TABLE "RuntimeCapsule" ADD COLUMN "publicationId" TEXT
REFERENCES "ValidationNodePublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RuntimeCapsule_publicationId_idx" ON "RuntimeCapsule"("publicationId");

ALTER TABLE "BaselineAttempt" ADD COLUMN "publicationId" TEXT
REFERENCES "ValidationNodePublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "BaselineAttempt_publicationId_idx" ON "BaselineAttempt"("publicationId");

-- Existing rows remain readable for migration diagnostics, but every newly
-- recorded evidence row must bind to an immutable node publication.
CREATE TRIGGER "RuntimeCapsule_require_publication_on_insert"
BEFORE INSERT ON "RuntimeCapsule"
WHEN NEW."publicationId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'RuntimeCapsule publicationId is required for new evidence');
END;

CREATE TRIGGER "BaselineAttempt_require_publication_on_insert"
BEFORE INSERT ON "BaselineAttempt"
WHEN NEW."publicationId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'BaselineAttempt publicationId is required for new evidence');
END;

-- Legacy request/receipt values are deliberately namespaced identifiers rather
-- than claims that old records carried cryptographic request or receipt hashes.
-- Every source field used below is validated by the guard before insertion.
INSERT INTO "ValidationNodePublication" (
  "id", "planId", "targetProjectId", "validationId", "contentHash",
  "publishOperationId", "operationHash", "runtimeInputHash", "projectionHash",
  "publicationHash", "publishedAt"
)
SELECT
  'legacy-publication:' || event."id",
  operation."planId",
  operation."targetProjectId",
  event."validationId",
  json_extract(event."payloadJson", '$.contentHash'),
  operation."id",
  operation."operationHash",
  operation."runtimeInputHash",
  operation."projectionHash",
  'legacy-publication:' || operation."operationHash" || ':' || event."validationId" || ':' || json_extract(event."payloadJson", '$.contentHash'),
  event."createdAt"
FROM "PlanEvent" AS event
JOIN "ValidationAstPublishOperation" AS operation ON operation."id" = event."publishOperationId"
WHERE event."type" = 'validation_node_decided';

INSERT INTO "ValidationDecisionReceipt" (
  "id", "publicationId", "decision", "decidedBy", "decidedAt",
  "requestHash", "idempotencyKey", "receiptHash"
)
SELECT
  'legacy-decision:' || event."id",
  'legacy-publication:' || event."id",
  json_extract(event."payloadJson", '$.decision'),
  json_extract(event."payloadJson", '$.decidedBy'),
  json_extract(event."payloadJson", '$.decidedAt'),
  'legacy-request:' || event."id",
  'legacy-event:' || event."id",
  'legacy-decision:' || event."id"
FROM "PlanEvent" AS event
WHERE event."type" = 'validation_node_decided';
