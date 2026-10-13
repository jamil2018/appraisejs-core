# Continue on the shared Journey migration branch

Date: 2026-10-13. Branch: `codex/journey-app-server-migration`.
Base: fetched `origin/appraise-0.5` at `8d4be5c83597bb17ac756f98502738db8a69d344`.
Local commit: find the cohesive `docs: propose M00 app-server host and authority contract` commit with `git log`.
The final session response records its exact ID; this file is included in that commit, so it does not self-reference.

## Current checkpoint

M00-r2 is a proposed detailed contract, awaiting exact acceptance; its approval checkbox remains open.
Read [contract](m00-host-authority-contract.md), [review/validation evidence](m00-review-evidence.md), ADR-0005,
plan/todo and the Open Design map. UI U00–U10 and migration M01–M13 are unstarted. No live sign-in, app-server/provider
run, schema migration, product/UI change, packaging or release was started. GC3 remains REVISE / not passed.

The user authorized local verified cohesive commits with hooks across this shared branch; push, merge and publication
still need separate instruction. Inspect worktree, branch, remote and local commits on every continuation. Reuse this
branch without reset, overwrite, automatic rebase or discarding unrelated work. Its base tracking is origin/appraise-0.5;
do not push using a default command that targets that base. A future authorized push must name its feature ref explicitly.

## Next bounded action

Resolve D01–D05 against the exact reviewed contract. Do not infer approval from this commit, an engineering review,
ADR-0005's direction, a checkbox or a provider capability. Only mark M00 accepted after exact explicit approval;
retain numerical runtime limits/retention and containment/auth feasibility gaps honestly. If revisions are requested,
edit documentation only and obtain review of changed authority boundaries before committing.

After acceptance, wait for a separate bounded instruction to start M01. M01 protocol qualification must not absorb
M02 containment, M03 schema, UI implementation or production authentication. Read pinned relevant upstream source/tests
and record actual executable/OS/build/protocol/config identity before future observations. Unexpected capability,
auth or containment gaps fail closed. Historical stock-desktop/plugin roadmap is superseded; preserve its records.

Copy-ready continuation request:

> Continue AppraiseJS on codex/journey-app-server-migration. Inspect current worktree and local M00 commit; read
> CONTINUE-HERE.md, m00-host-authority-contract.md and m00-review-evidence.md. Address only explicitly requested M00
> contract decisions/revisions. Keep M00 approval pending unless I explicitly accept the exact revision. Do not start
> M01, UI implementation, live authentication/provider runs, schema or release work. Preserve all historical evidence
> and GC3 REVISE; make only verified local commits with hooks, without pushing.
