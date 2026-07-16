-- Supports project-scoped keyset pagination ordered by startedAt DESC, id DESC.
-- Measured by scripts/benchmark-repository-queries.mjs; write cost is one additional index entry per test run.
CREATE INDEX "TestRun_targetProjectId_startedAt_id_idx" ON "TestRun"("targetProjectId", "startedAt", "id");
