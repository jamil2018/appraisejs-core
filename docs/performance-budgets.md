# Performance Budgets

## Bounded reads

- List services default to 50 records and clamp callers to 100 records per page.
- Test-run cursors are project-bound and use the stable `startedAt DESC, id DESC` ordering tuple.
- Stored log tails read at most the requested byte budget plus four UTF-8 alignment bytes; the HTTP route caps a
  request to 500 KiB and reports truncation and byte offsets.

## Repository query benchmark

Run `npm run benchmark:repository-queries`. The deterministic in-memory fixture creates 20,000 test runs across 20
projects and executes the project-scoped keyset query 250 times before and after adding
`TestRun(targetProjectId, startedAt, id)`. The before plan performs a scan and temporary sort; the after plan uses the
covering composite index. The benchmark reports latency for context, but release acceptance asserts the query plan,
not a timing-fragile millisecond threshold. The index costs one additional entry and index update per test-run write.
