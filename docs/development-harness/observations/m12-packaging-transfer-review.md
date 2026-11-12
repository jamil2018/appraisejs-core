# M12 packaging and transfer review

Requested routing: bounded packaging investigation, transfer design, settled implementation and independent final
artifact review. Assignments used `fork_turns: none` with bounded packets. Requested selectors and the host's spawn
responses are available in the conversation; effective role/model/context/sandbox attestations are unavailable.
The local route journal records that limitation. No credential or attestation specimen is substituted for proof.

Infrastructure observations: package-local dependencies matter because the root and CLI use different Zod majors;
root Prisma generation is required before scaffold preparation; TSX IPC, loopback transport and owned process tests
need the appropriate local host profile. A worktree `.git` file causes the root install hook initializer to report
ENOTDIR; the existing shared pre-commit hook is still used normally. These observations do not authorize changing
harness enforcement or global setup.

A transfer design review identified three distinct boundaries: durable accepted artifacts, physical provider
reconciliation and original owned-resource cleanup. Tests keep them separate. Review also identified the older
same-host entry point as a possible bypass of stricter cross-host checks; canonical guards cover that entry point
rather than relying on callers selecting the new API field.

Efficiency: separate packaging and ownership files avoided concurrent overlapping writes. Retained initial failures
were diagnosed before new disposable runs; spent M06 attempts were never invoked. No new harness policy is proposed
as a completion prerequisite. The portable M12 verification index records actual results and qualification limits.

Independent review found a canonical resume bypass after unarmed-intent invalidation and a proof importing producer
source. Both require concrete corrections and re-verification before acceptance. Packaging fixture failures also
included counting `migration_lock.toml` as a migration, null-prototype SQLite result comparisons and identical synthetic
bytes assigned conflicting receipt roles. Those are fixture defects; the schema's conflict refusal is retained.

Normal Fallow initially rejected four introduced complexity findings and one clone. Mechanical refactoring shared the
scoped reader, named ownership/cleanup checks and simplified proof command recording. The normal gate then reported
zero introduced findings and React Doctor 100/100. No suppression or baseline was changed. Advisory assessment is
8/10 (routing1 and efficiency1; other dimensions2). The scorecard refused absent effective-context evidence; that refusal is retained
rather than inventing a host receipt. Failed fixture launch cleanup remains unverified independently of later passes.

A coordinator compatibility challenge after provisional acceptance exposed a genuine downgrade gap: testing a
synthetic future ledger had not proved the actual prior binary refused M12 semantics. Independent reproduction
confirmed the unchanged M11 guard accepted a real M12 transfer and its old session checker accepted a foreign
principal. Acceptance was explicitly superseded. Meaningful persisted contract versioning and actual predecessor
startup refusal are required; passing refusal algorithms do not establish a new application's compatibility floor.

Routing anomaly: the packaging evidence lane was reused for bounded implementation. A later read-only role refusal
made the mismatch explicit; the coordinator handled the remaining writes. Phase changes should use an appropriate
execution assignment rather than assuming a read-only evidence role changed. Requested roles are not effective-host
attestations. This observation changes no harness enforcement.
