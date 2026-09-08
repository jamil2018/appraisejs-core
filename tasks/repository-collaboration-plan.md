# Repository collaboration and agent-assisted Git management

Status: implementation in progress; independent release review reopened Phase 5-8 blockers before Phase 9.

Updated: 2026-09-09. This replaces the conversation's manual-Git-only plan.

Implementation checklist: [repository-collaboration-todo.md](./repository-collaboration-todo.md).

Delivery evidence is recorded phase-by-phase in that checklist. Phase 1 now includes the strict exchange contract,
portable identity mapping, additive persistence schema, canonical projections for every authored aggregate, explicit
local environment mapping, exact Step Definition references, bounded readers, and a cross-database round-trip fixture.
Phase 2 adds durable prepare/decide/execute operations, dependency-closed three-way review, atomic database receipts,
stale and idempotency guards, journaled filesystem publication/recovery, and the first project-scoped Collaboration UI.
Phases 3-8 add archive-safe domain boundaries and undo, non-authoritative Journey reuse, bounded Git operations,
durable scheduling and agent handoff, and isolated structured divergent reconciliation.

The first independent release review rejected the initial Phase 5-8 implementation. The implementation now includes
operation-owned Git step authority/order and push range proof, exclusive worker leases and scheduler integration, a
real-agent public-client proof, Git-backed receive, deterministic decisions, realistic restore, and final divergent
Git/database integration. The checklist remains intentionally reopened until final validation and independent
re-review pass against this repaired artifact.

## Outcome and scope

Collaborators share authored tests and reusable Journey design through Git. Appraise detects pending work,
prepares synchronization, hands agent work to a connected client, and resumes accepted operations without asking
the user to compose a new prompt for every synchronization.

SQLite remains local authoring authority. Repository files are validated exchange inputs. Appraise owns Git and
database mutations, authorization checks, operation state, recovery, and receipts. Agents explain changes and
propose resolutions through bounded tools.

The first release includes managed status/fetch, fast-forward integration, scoped commit/push, durable work
handoffs, and structured conflict proposals. A later delivery phase adds isolated divergent-merge preparation
for collaboration files. Rebase, force push, automatic stash/reset, general code-conflict resolution, and a full
Git client are excluded.

Journey sharing is **reuse only**: briefs, analysis, and scenarios become editable local inputs. There is no
continuation, ownership transfer, shared lifecycle authority, or imported approval/evidence. This supersedes the
earlier suggestion of a later active-Journey handoff phase.

## Current repository evidence

- Authored modules, suites, cases, templates, locators, environments, and tags are project-scoped Prisma records.
  There is no supported repository-to-authoring import path.
- `src/lib/repository-export/storage.ts` supplies filesystem publication mechanics, but its manifest is a derived
  validation export contract. Current documentation describes jobs/endpoints absent from current source. This
  helper is not a complete collaboration engine or a proven crash-recovery protocol.
- `exportQualityJourney` in the Journey artifact-library service exports redacted projections. Exported test
  entries lack the complete authored graph needed for reconstruction.
- Target identity depends on local paths. Shared content therefore needs a separate portable identity.
- Existing test-case deletion removes run associations. Collaboration archives cannot call destructive deletion
  paths. Current schema cascades also require explicit dependency handling.
- Existing Git support consists of optional initialization and a diagnostic status check. MCP contracts already
  support project binding, structured errors, safety annotations, and generated client capability descriptions.
- Existing storage and Journey-library tests passed, 8 tests across 2 files. These checks do not validate the
  proposed exchange, queue, authorization, or Git recovery behavior.

## Product workflow and standing authorization

### One-time connection

Provide **Connect collaboration agent** in project settings. Bind the local project, canonical repository,
configured remote, tracked branch, portable project identity, and available agent connection. Record observed
capabilities and connection health; saved configuration alone does not prove an agent can be contacted.

Offer independent permissions with these defaults after connection:

| Permission                                         | Default           | Boundary                                                                |
| -------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| Observe local changes and check remote             | Enabled           | Configured repository and remote only                                   |
| Prepare synchronization and agent proposals        | Enabled           | No local authoring or tracked-branch mutation                           |
| Integrate and apply conflict-free incoming content | Disabled          | Explicit opt-in; collaboration-only Git delta, exact validated snapshot |
| Commit collaboration changes                       | Disabled          | Reviewed or explicitly authorized collaboration files only              |
| Push commits                                       | Disabled          | Configured remote/ref and eligible commit range only                    |
| Resolve conflicting behavior or archive content    | Decision required | Exact proposed content and dependency consequences                      |

Standing authorization is stored with a policy version, scope, grant provenance, and revocation state. Every
mutation rechecks it. An agent cannot grant or widen its own permissions. A supported host authorization may be
recorded through an authenticated trusted channel; ordinary agent-supplied JSON is not proof of a user grant.
Operation-specific acceptance binds the exact snapshot and resolution digest. Materially changed content requires
new acceptance unless independently covered by standing authorization.

Default remote checks run every five minutes while the Appraise service is running and collaboration is enabled.
Local observations are debounced by two seconds. Check again on project open, worker reconnect, and service
startup. Back off transient remote failures up to thirty minutes; authentication failures wait for credential
repair or an explicit retry. No operating-system service installation is implied by project connection.

### Daily experience

1. Appraise observes a local revision/file change, remote update, or explicit publication request.
2. It creates or updates one pending synchronization task for the repository binding.
3. Deterministic preparation runs in Appraise. Agent work is dispatched only when its capabilities are needed.
4. Work within standing permissions proceeds. Conflicts, archives, out-of-scope changes, and publication without
   authorization become focused decision cards.
5. The user's decision resumes the same durable operation. Completed steps are not replayed as new work.
6. Show a receipt and any remaining unpublished local changes.

A filesystem watcher may detect changed files but never interprets absence as an archive instruction. Appraise
CRUD changes may mark content available to publish; they do not automatically export or commit it.

The Collaboration page shows connection health, branch/remote, progress, local and incoming changes, proposed
resolutions, decisions, and receipts. Notifications occur for meaningful completion, a required decision, or an
actionable failure. Repeated unchanged checks remain quiet.

## Durable collaboration work and agent handoff

Use a dedicated collaboration queue, separate from Quality Journey work, approvals, and execution authority.
Queue records are local operational data and are never committed to the exchange directory.

Each operation stores its binding, receive/publish/reconcile intent, trigger, observed Git revisions, dependency
snapshots, standing-policy version, prepared changes, decisions, attempt state, and receipts. Use explicit states:
`QUEUED`, `PREPARING`, `WAITING_FOR_AGENT`, `WAITING_FOR_DECISION`, `READY`, `APPLYING`, `COMPLETED`, `BLOCKED`,
`FAILED`, `CANCELLED`, and `SUPERSEDED`.

- Coalesce repeated triggers into one queued intent per binding. A changed source never rewrites an accepted or
  in-flight snapshot: mark it stale/superseded before mutation or enqueue a successor after the active operation.
- Serialize mutation across bindings that share a Git common directory, including linked worktrees. Per-target
  database reconciliation also has one active mutator. External Git clients remain possible, so locks supplement
  revision/index/worktree checks rather than replace them.
- Claims have short-lived leases, heartbeats, and monotonically increasing attempt/fencing identities. Reject
  expired or replaced attempts at every mutation boundary. Appraise runs mutations centrally and does not accept
  an agent's claimed shell success as a receipt.
- On disconnect, preserve progress. Reclaim expired read/proposal work; recover an in-flight mutation through its
  journal before allowing another attempt. Transport uncertainty triggers operation lookup, not blind retry.
- Cancellation stops new steps. A completed commit/push is reported honestly and is never represented as undone.

Support two explicit connection modes:

1. **Connected worker:** an authenticated, capable agent client maintains a session, claims queued work with bounded
   long polling, and sends heartbeats. A tested host adapter may start/wake that session when supported. The initial
   implementation must support an already-running worker without assuming arbitrary desktop-agent launch APIs.
2. **Interactive handoff:** when no background worker is available, show **Continue with agent**. A short-lived,
   single-use, project/operation-bound ticket redeems to the pending work and permissions. Use a verified native
   host handoff when available; otherwise provide one prepared bootstrap action. Never require the user to assemble
   the synchronization prompt or expose repository credentials in it.

MCP alone cannot wake a disconnected client. Background mode is advertised only after observed registration and
claim/heartbeat capability. If unavailable, deterministic preparation can still run and decisions/work stay queued.

All agent responses include operation ID, state/version, concise summary, blockers, permitted next actions,
authorization requirements, and available receipts. New clients resume from stored state, not chat transcripts.
Repository text is untrusted task data; it cannot change permissions, invoke commands, or grant lifecycle authority.

## Exchange format and reconciliation invariants

### Format and identity

Create a committed `appraise/collaboration/` directory with a versioned JSON manifest and one record per authored
aggregate under fixed kind directories. Cases/templates contain their ordered steps and flow structure. Include
modules, suites and membership, cases, templates, locator groups/locators, authored filter tags, logical environment
references, and dedicated Journey reuse assets.

Runtime base/API URLs, usernames, credentials, password environment-variable names, absolute paths, runtime
installations, executable extensions, runs, metrics, generated identifier tags, and lifecycle authority remain
local. Show exact portable content before first publication; strict field allowlists do not prove that arbitrary
user-written prose contains no sensitive text.

Step Definitions are exact local prerequisites, not imported executable publications. Require ready definitions
with the exact ID, version, computed definition hash, and valid invocation inputs. Environment references require
explicit local mappings; import must not overwrite local runtime environment values.

Identify each record by `(portableProjectId, kind, portableId)`. SQLite mappings additionally include the local
TargetProject binding. Multiple local projects can bind the same portable project with independent mappings and
baselines. Each local project has one binding; rebinding is unsupported in v1. Names and paths are never identity.
No-baseline collisions require explicit adoption/conflict review, even when content is equal.

Use strict schemas and deterministic normalization. Reject unsupported versions, unknown fields/kinds, duplicate
keys, path escapes, symlinks, invalid references, cycles, and oversized input. Set v1 limits to 10,000 records,
2 MiB per record, and 64 MiB total; reject excessive input before preparation. Compute snapshot hashes in Appraise
so authors need not maintain checksums after editing files.

Each relationship has one canonical owner: module parent, locator-group module, locator group reference, suite case
membership, and case/template ordered steps and references. Identifier tags are local derived data.

### Three-way review

Persist the last acknowledged repository payload per mapped record and compare it with current local content and
incoming normalized content. One-sided incoming changes are import candidates; one-sided local changes remain
available to publish; equal concurrent changes rebaseline; unequal concurrent changes require whole-record
resolution. Archive-versus-edit is a conflict.

Offer Keep local, Use incoming, or Edit resolution. Agents may propose the edited whole record, but Appraise
validates it deterministically. Keeping local acknowledges the incoming baseline while retaining a visible local
difference. No automatic field-level merge or fuzzy identity matching is permitted.

The entire prepared snapshot applies atomically. Missing exact Step Definitions, required local environment
bindings, or dependency resolutions block it; v1 has no partial import or silently non-runnable quarantine.

### Apply, archive, and undo

Pin source bytes, Git revisions where present, baseline hashes, local payload/read-set hashes, catalog and binding
state, policy version, and the resulting dependency graph. Recheck at mutation time. Domain writes, maps, baselines,
before-images, and the receipt commit in one Prisma transaction. A post-operation rescan reports source changes
after preflight; the receipt always identifies the snapshot actually applied.

Use explicit archive tombstones, retained indefinitely until an explicit full-record restoration under the same
identity. Missing files or removed tracked membership without tombstones are invalid. An unseen tombstone records
baseline state without fabricating a domain row.

Add archive metadata to exchanged domain roots and prevent destructive deletion of collaboration-managed rows.
Preserve historical run/report relationships and reserved unique names. No implicit cascades: explicitly reparent
or archive descendants, rebind/detach active references, or archive affected dependents in the same reviewed set.
Archiving a suite does not archive its shared cases. Historical/archived edges remain available, while active
authoring, tag filters, locator lookup, new-run selection, and new materialization exclude archived content.
Existing frozen execution remains readable and retains its own authority.

Restore preserves identity and validates active dependencies. Undo is another reviewed, stale-guarded inverse
operation. Imported creations are archived if removing them would damage references. Undo does not silently reset
Git or rewrite published history; published corrections require a new commit.

## Git operation and recovery contract

Execute bounded argument-vector Git commands from the verified repository root using the machine's credential
mechanisms. Sanitize diagnostics; never return tokens or credentials. Observe hooks, signing, configured upstreams,
Git worktrees, detached HEAD, and merge/rebase state. Required hook/signing failures block publication and are not
bypassed. Disallow arbitrary agent-supplied shell commands and remote/ref changes through synchronization tools.

Fetch pins a remote commit for preparation. Fast-forward integration requires clean index/worktree, no pending Git
operation, the expected local HEAD, and an authorized full-tree change. Auto-integration permission covers only
collaboration-directory deltas. Incoming code or other files require a review of the full commit change or external
Git handling, even when collaboration files validate.

Outgoing commits include only the exact authorized collaboration changes. Do not consume unrelated staged entries;
initial v1 blocks commit until unrelated staging is resolved. Preserve unrelated unstaged/untracked content and
never use broad staging. Bind permission to the resulting tree, parent commit, remote/ref, and eligible outgoing
commit range. Additional unpublished commits outside scope block push. Rejected pushes trigger fresh preparation;
never force push.

Git filesystem changes, local SQLite updates, and remote push cannot share one transaction. Journal each boundary
and expose partial progress such as "checkout updated; data application pending" or "committed; push pending".
Pin the prepared import before Git integration, revalidate database state after integration, and resume only if its
snapshot still applies. Do not claim successful synchronization until required phases have receipts.

Filesystem publication uses validated sibling staging, durable journal entries, verified backup retention, and
hash-based recovery. Unknown external files block replacement. Serialize publication with Git operations. After a
crash, finish or restore only verified states; preserve ambiguous state for recovery review.

For a lost push response, inspect remote reachability of the exact intended commit before retrying. A later remote
advance must not cause duplicate publication. Recover commits similarly by their recorded parent/tree/identity.

Divergent merge preparation uses an isolated temporary worktree. Agents may propose structured resolutions only
for collaboration records; validate both Git results and the resulting database reconciliation. Out-of-scope code
conflicts remain blocked for an external handoff. Integrate only after exact review and unchanged source checks;
retain recovery artifacts until terminal completion. Temporary worktrees share the repository mutation lock.

## Journey reuse boundary

Use a separate allowlisted REUSE projection. Import into a reusable-content library, never active Journey tables.
Selecting an asset creates a fresh draft through the current draft service, with no predecessor/continuation link.
Pin the source version so subsequent library updates cannot rewrite an existing draft or Journey.

Analysis and scenarios seed normal Analyzer/Scenario Designer work. New local outputs establish requirement
traceability and current discovery bindings and pass all existing assignment, publication, and approval gates.
Foreign IDs, observations, resource assumptions, and source approval claims are informational annotations only.
Never import approvals, evidence, consent, leases, execution bindings, lifecycle status, or closure authority.

## Service and MCP interfaces

Implement one service layer with UI and CLI/MCP parity. The following are proposed new operation names, not claims
about tools currently available:

- `collaboration_connect`, `collaboration_policy_update`, `collaboration_status`.
- `collaboration_prepare` for RECEIVE, PUBLISH, or RECONCILE; `collaboration_get` for durable progress.
- `collaboration_resolution_propose`, `collaboration_decide`, `collaboration_execute`, and
  `collaboration_undo_prepare`. Execute accepts only an operation ID, expected version/digest, idempotency key,
  and a permitted prepared step; the service derives paths, commands, and mutation content.
- `collaboration_worker_register`, `collaboration_work_claim`, `collaboration_work_heartbeat`,
  `collaboration_work_complete`, and `collaboration_handoff_redeem`.

Policy grants and user decisions need trusted principal provenance, even if callable through the same transport.
An agent may submit proposals, not manufacture decisions by choosing a reviewer name. Derive tool safety annotations
from actual effects: preparation that fetches or persists operations is not a read-only tool. Generate schemas,
resources, setup capabilities, and reference documentation from the canonical contract.

## Delivery sequence and acceptance checkpoints

Each phase includes source, focused tests, and relevant current docs. Detailed unchecked tasks are in the companion
checklist. Implementation starts on a dedicated branch and preserves unrelated worktree changes.

1. **Exchange identity and contracts:** add additive schemas/mappings/baselines and canonical serializers.
   Acceptance: two databases reconstruct the same authored graph with different local IDs; malformed content writes
   no domain data.
2. **Explicit publication and consumption:** deliver reviewed publish, three-way conflict resolution, atomic import,
   receipts, and journaled recovery before automatic scheduling. Acceptance: round trips preserve local differences,
   exact Steps, and dependency closure; crash/retry behavior is deterministic.
3. **Archive and recovery:** implement archive-aware CRUD/read/run/materialization boundaries, tombstones, restore,
   and guarded undo. Acceptance: archives survive skipped Git commits and preserve history without new execution use.
4. **Journey reuse:** deliver reusable library, draft creation, and worker input integration. Acceptance: fresh local
   lineage and normal gates; foreign content cannot populate authority tables.
5. **Bounded Git management:** deliver status/fetch, fast-forward preparation/integration, scoped commit/push, and
   cross-system journals. Acceptance: unrelated content/index entries survive; stale revisions, hooks, rejected pushes,
   and lost responses recover without false completion.
6. **Persistent queue and authorization:** implement policy grants, triggers, coalescing, leases/fencing, scheduler,
   cancellation, and quiet actionable notifications. Acceptance: one logical task per burst, policy revocation blocks
   later steps, restarts preserve progress, and one mutator owns shared Git state.
7. **Agent connection and organized handoff:** implement capability registration, claim/heartbeat, single-use tickets,
   native host adapter where verified, interactive fallback, and resume after user decisions. Acceptance: demonstrate
   one real connected agent end-to-end; offline/unavailable clients remain honestly queued without fabricated wakeups.
8. **Agent-assisted divergent reconciliation:** add isolated worktrees and structured whole-record proposals.
   Acceptance: valid proposed resolutions pass ordinary validation and exact review; code conflicts remain scoped out.
9. **Release integration:** complete UI/CLI/MCP parity, additive migration rehearsal, scaffold sync, generated
   contracts/Graphify, current docs repair, and independent persistence/security review.

Phases 1-7 provide the first usable agent-assisted collaboration release. Phase 8 extends it without changing the
authority or handoff model. Phase 9 checks apply before either release, not just after phase 8.

## Verification and completion

Test independent clones and different local IDs; first adoption; project mismatches; same-name collisions; equal,
one-sided, and divergent edits; explicit tombstones across skipped commits; restored identity; required dependency
closure; historical queries; Step Definition and binding drift; stale preview/apply/undo; transactional failures;
unknown files/path/symlink attacks; and no imported Journey authority.

Add hermetic Git integration tests with local bare remotes for clean/dirty indexes, detached HEAD, linked worktrees,
branch divergence, external mutation, unrelated staged files, hook failure, eligible outgoing ranges, push rejection,
lost responses, and every publication/install/journal crash boundary. Prove cross-database/filesystem partial states
remain recoverable and visible rather than claiming atomicity across systems.

Queue tests use fake time for trigger bursts, polling/backoff, reconnects, lease expiry, supersession, policy changes,
ticket expiry/replay, competing workers, cancellation, notification deduplication, and resumed decisions. Verify
agents cannot forge grants, widen scope, or mutate through expired attempts. Exercise the real connected-agent and
interactive fallback paths; fake workers alone do not prove host capability.

Run browser checks for setup, status, prepared diffs, conflicts, one-time decisions, auto-resumption, receipts, and
offline fallback. Run focused lint/formatting, SQLite integrations, applicable lifecycle/runtime regressions, build,
scaffold/package parity, Fallow, React Doctor, generated MCP-reference checks, harness checks, and Graphify updates.

Completion requires two collaborators to share authored changes through Git, resolve differences without losing
local work/history, reuse Journey design under fresh gates, and synchronize through durable agent handoffs without
repeated prompt-writing. No background capability or successful mutation may be claimed without observed evidence.
