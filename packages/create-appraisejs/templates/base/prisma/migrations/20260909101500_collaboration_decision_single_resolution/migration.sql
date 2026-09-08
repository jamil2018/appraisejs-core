-- Make one reviewed resolution authoritative for each operation record.
--
-- Earlier builds allowed different resolution digests for the same operation
-- record. Before enforcing the stronger invariant, preserve every ambiguous
-- authority claim in the operation's append-only journal, choose a canonical
-- row deterministically (oldest createdAt, then id), and block the operation
-- so an executor cannot act on an ambiguity that required migration repair.
-- The losing rows are removed only after their complete content is recorded in
-- the journal; the entry is intentionally queryable by operation history.
INSERT INTO "CollaborationJournalEntry" ("id", "operationId", "sequence", "boundary", "status", "detailsJson", "createdAt")
SELECT
  lower(hex(randomblob(16))),
  duplicate_groups."operationId",
  COALESCE((
    SELECT MAX(existing."sequence") + 1
    FROM "CollaborationJournalEntry" AS existing
    WHERE existing."operationId" = duplicate_groups."operationId"
  ), 1),
  'DECISION_AUTHORITY_MIGRATION',
  'BLOCKED',
  json_object(
    'code', 'AMBIGUOUS_LEGACY_DECISIONS',
    'canonicalSelection', 'oldest-createdAt-then-id',
    'duplicateRecordKeys', json(duplicate_groups."recordKeys"),
    'decisions', json(duplicate_groups."decisions")
  ),
  CURRENT_TIMESTAMP
FROM (
  SELECT
    "operationId",
    json_group_array("recordKey") AS "recordKeys",
    json_group_array(json("decisionJson")) AS "decisions"
  FROM (
    SELECT
      decision."operationId",
      decision."recordKey",
      json_object(
        'recordKey', decision."recordKey",
        'id', decision."id",
        'kind', decision."kind",
        'resolutionJson', decision."resolutionJson",
        'resolutionDigest', decision."resolutionDigest",
        'trustedPrincipalId', decision."trustedPrincipalId",
        'provenance', decision."provenance",
        'createdAt', decision."createdAt"
      ) AS "decisionJson"
    FROM "CollaborationDecision" AS decision
    INNER JOIN (
      SELECT "operationId", "recordKey"
      FROM "CollaborationDecision"
      GROUP BY "operationId", "recordKey"
      HAVING COUNT(*) > 1
    ) AS duplicate_keys
      ON duplicate_keys."operationId" = decision."operationId"
      AND duplicate_keys."recordKey" = decision."recordKey"
    ORDER BY decision."operationId", decision."recordKey", decision."createdAt", decision."id"
  ) AS duplicate_decisions
  GROUP BY "operationId"
) AS duplicate_groups;

UPDATE "CollaborationOperation"
SET
  "state" = 'BLOCKED',
  "blockerJson" = json_object('code', 'AMBIGUOUS_LEGACY_DECISIONS')
WHERE "id" IN (
  SELECT DISTINCT "operationId"
  FROM (
    SELECT "operationId", "recordKey"
    FROM "CollaborationDecision"
    GROUP BY "operationId", "recordKey"
    HAVING COUNT(*) > 1
  )
);

DELETE FROM "CollaborationDecision"
WHERE "id" IN (
  SELECT losing."id"
  FROM "CollaborationDecision" AS losing
  INNER JOIN "CollaborationDecision" AS canonical
    ON canonical."operationId" = losing."operationId"
    AND canonical."recordKey" = losing."recordKey"
    AND (
      canonical."createdAt" < losing."createdAt"
      OR (canonical."createdAt" = losing."createdAt" AND canonical."id" < losing."id")
    )
);

CREATE UNIQUE INDEX "CollaborationDecision_operationId_recordKey_key" ON "CollaborationDecision"("operationId", "recordKey");

DROP INDEX "CollaborationDecision_operationId_recordKey_resolutionDigest_key";
