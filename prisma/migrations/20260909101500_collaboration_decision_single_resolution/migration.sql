-- Make one reviewed resolution authoritative for each operation record. The
-- new index is created before the obsolete narrower index is dropped, so a
-- database with ambiguous historical rows fails without losing evidence.
CREATE UNIQUE INDEX "CollaborationDecision_operationId_recordKey_key" ON "CollaborationDecision"("operationId", "recordKey");

DROP INDEX "CollaborationDecision_operationId_recordKey_resolutionDigest_key";
