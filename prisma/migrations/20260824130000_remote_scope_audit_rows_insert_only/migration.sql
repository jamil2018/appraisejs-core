-- Remote evaluation scopes and their issuance receipts are audit facts. The
-- v1/v2 tables predate the immutable-generation cutover, so enforce the same
-- database-level insert-only invariant here rather than trusting callers.
CREATE TRIGGER "RemoteEvaluationScopeBinding_no_update"
BEFORE UPDATE ON "RemoteEvaluationScopeBinding"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopeBinding is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopeBinding_no_delete"
BEFORE DELETE ON "RemoteEvaluationScopeBinding"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopeBinding is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopeIssuance_no_update"
BEFORE UPDATE ON "RemoteEvaluationScopeIssuance"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopeIssuance is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopeIssuance_no_delete"
BEFORE DELETE ON "RemoteEvaluationScopeIssuance"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopeIssuance is insert-only');
END;
