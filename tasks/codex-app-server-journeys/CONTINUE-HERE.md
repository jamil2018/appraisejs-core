# Continue on the shared Journey migration branch

Date: 2026-10-13. Branch: `codex/journey-app-server-migration`.
Base: fetched `origin/appraise-0.5` at `8d4be5c83597bb17ac756f98502738db8a69d344`.
M00-r2 commit: `201fac766b8006f84ea20cf88c255318c55288b1`.
Approved M00-r3 contract commit: `f506fccb2f910641d7a943bec440088512f0d714`.
Approval-recording commit: find `docs: record exact M00-r3 approval and continuation boundary` with `git log`;
this handoff is included in that commit and does not self-reference its hash.

## Current checkpoint

**M00 complete as an explicitly approved design contract.**
The user approved M00-r3 at f506fccb and SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
Read the [exact approval record](m00-r3-approval.md), [byte-frozen contract](m00-host-authority-contract.md),
[review evidence](m00-review-evidence.md), ADR-0005, plan/todo and Open Design map.
The frozen contract retains its submission-time pending header; the separate exact approval record is the current
acceptance status. Preserve its bytes; future revisions require separate exact review and approval.

M01–M13 and UI U00–U10 remain unstarted. No live sign-in, app-server/provider run, schema migration,
product/UI implementation, packaging or release occurred. Runtime support/authentication/containment and entitlement
remain unqualified. GC3 remains **REVISE / not passed**; all historical records/evidence remain intact.

## Authority and next bounded action

Wait for a separate user instruction to start M01. M00 approval satisfies M01's design dependency but does not
start or authorize it. Do not automatically fetch/install a binary, launch app-server, authenticate, run a provider,
probe containment or start UI/schema/release work. Do not resume the superseded stock-desktop/plugin roadmap.

If M01 is explicitly authorized later, first inspect the branch, worktree, local commits and remote. Reuse this
shared branch without reset, overwrite, automatic rebase or discarding unrelated work. Read M01's exact scope and
pinned upstream source/tests; pin the actual executable/OS/build/protocol/config identity for its observations.
M01 must not absorb M02 containment, M03 schema, UI implementation or production authentication. M02 authority
results stay provisional until M03 mandatory-session re-probes; no product dispatch by inference.

The user authorized local verified cohesive commits with repository hooks. Push, merge and publication require
separate instruction. The branch tracks origin/appraise-0.5; any future authorized push must name the feature ref
explicitly and must not target the base via a default command.

Copy-ready checkpoint request (does not authorize M01):

> Continue AppraiseJS on codex/journey-app-server-migration. Inspect current worktree/local commits and read
> CONTINUE-HERE.md, m00-r3-approval.md and the approved M00-r3 contract. M00 is complete at f506fccb and its recorded
> SHA-256. Keep M01 and all later tasks unstarted until I give a separate bounded instruction. Preserve approved
> contract bytes, lifecycle history and GC3 REVISE. Local commits only with hooks; no push, merge or publication.
