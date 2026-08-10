# Evidence Execution

Evidence execution is initiated by a ready Assessment. AppraiseJS verifies the immutable target, subject revision, published Validation Version, requirement alignment, and matrix selection before materializing any managed TestRun.

Each execution is content-bound and idempotent. Reconciliation preserves completed matrix cells, verifies capsule and artifact integrity, and seals Evidence Receipts without discarding partial results. Reviewers use the evidence matrix and its receipt hashes when making a quality decision.
