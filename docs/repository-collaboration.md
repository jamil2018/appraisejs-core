# Repository Collaboration

Repository collaboration exchanges authored test aggregates through the committed `appraise/collaboration/`
directory. SQLite remains the local authoring authority: repository content is a validated, reviewed input and never
becomes execution or Quality Journey authority merely because it exists in Git.

## Setup and permissions

Open **Collaboration** for a registered local-workspace project and connect its repository root, remote, and tracked
branch. The repository root must exactly match the selected project's canonical path. One binding owns one portable
project identity; rebinding is intentionally unsupported in v1.

Observe and prepare permissions start enabled. Integrate, commit, push, resolve, and archive permissions start
disabled. Every mutation rechecks the current versioned grant. The local UI records trusted grants and decisions;
an authenticated host transport may do so only with a local UI-issued receipt. Repository files and worker proposals
cannot widen permissions. Public
policy changes and review decisions need a local UI-issued, one-action authority receipt: ordinary project bearer
authentication alone is insufficient. A receipt is 256-bit random, stored only as a hash, binds the target, binding,
action, optional operation, current policy version, and canonical full request digest, expires within five minutes,
and is invalidated when replaced. Send it only in `X-Appraise-Authority-Receipt`, never JSON, argv, environment,
coordinator configuration, or logs. Exact consumed replay returns the stored sanitized result without a second mutation.

## Exchange and review

The versioned manifest and one-record-per-aggregate files use strict allowlists, canonical JSON, portable IDs, and
bounded readers. Runtime URLs, credentials, absolute paths, runs, reports, and lifecycle approvals are excluded.
Step invocations retain exact local Step Definition IDs, versions, hashes, and inputs; missing prerequisites block the
whole import. Environment records are logical references and require an explicit local mapping.

Preparation compares incoming, local, and last acknowledged records. One-sided changes are candidates, equal changes
rebaseline, and unequal or archive-versus-edit changes require a whole-record Keep local, Use incoming, or validated
Edit decision. The accepted digest, local read set, policy version, and source snapshot are rechecked before apply.
Receive preparation fetches the configured tracked branch into an operation-owned ref and reads the pinned strict
snapshot from an isolated worktree; the UI and public coordinator do not accept pasted repository records or refs.
It classifies equal, remote-ahead, local-ahead, unrelated, and diverged histories before creating any executable
plan. Local-ahead, unrelated, and foreign-path divergence are blocked with that exact classification. Only a true
collaboration-only divergence creates an internal RECONCILE operation with no accepted digest. Appraise creates and
persists its isolated proposal worktree first, then queues that same operation for a compatible worker or sanitized
interactive handoff.

After an exact decision reaches `READY`, the local UI and receipt-protected public coordinator automatically advance
the bounded, persisted operation plan. Each iteration reloads the durable operation version and executes only its next
pending, permission-checked step; callers cannot select a Git action or skip a boundary. A running boundary, revoked
permission, stale version, or error stops continuation conservatively for the existing recovery/status path. An exact
lost response still replays only its recorded completed step.

While the Appraise process is active, a single process-local five-minute scheduler observes only persisted due remote
checks and recovers expired leases. Transient remote failures use bounded backoff. Authentication failures instead
persist an authentication-repair pause and are excluded from later ticks, so the scheduler never repeatedly retries
known-bad credentials. The Collaboration UI truthfully shows that pause and offers the only retry path: an explicit
local-user remote check after the credentials have been repaired. No coordinator bearer or background timer can clear
that repair boundary.

## Recovery

Database records, mappings, baselines, before-images, and their receipt commit in one Prisma transaction. Filesystem,
Git, database, and remote effects cannot share a transaction, so Appraise records each external boundary and reports
partial progress honestly. Before a Git or filesystem effect, its persisted step stores the caller request version,
canonical intent and hash, executor epoch, and lock fence. Completion must still own that exact fence and intent. A
lost response can return only the persisted result for the request version that produced the operation's current
version; it never runs a step again.

Every Git mutation and collaboration filesystem install or recovery first acquires the same fenced database lock for
the repository's verified Git common directory. External filesystem, hook, and remote work runs outside database
transactions while the holder renews that lease; a lost or replaced lease prevents success from being recorded and
the effect is left for conservative recovery. Linked worktrees therefore share one mutation boundary rather than
locking their worktree paths independently.

Publication persists the strict filesystem snapshot that was present at preparation and compares it again at install.
This permits a second valid publication after the first, while blocking files changed outside the accepted operation.
Filesystem recovery restores a verified previous snapshot to a retryable `READY` step, or marks an installed strict
snapshot complete; any other rename state blocks without deleting its artifacts. The commit intent persists its exact
parent and installed snapshot hash before `git commit`, so recovery recognizes only that parent/snapshot/path set.
Before SQLite apply after Git integration, Appraise
rechecks the pinned HEAD and the strict snapshot hash from the accepted source or reviewed result.

Recovery of an APPLYING/RUNNING Git step first acquires a new fenced executor epoch, then classifies current Git
observations as verified completed, safe no-effect retry, or ambiguous block. An uncertain push may complete when a
fresh operation-owned remote observation proves the exact operation commit is reachable from a later remote tip.
Missing legacy intent, an unobservable remote, an unplanned merge path, or uncertain cleanup blocks and retains
recovery artifacts. A remote ref is absent only after Git verifies absence; transport and authentication failures are
not treated as absence.

Appraise never resets, stashes, cleans, rebases, force-pushes, bypasses hooks, or consumes unrelated staged content.
Authentication, signing, hook, and remote rejection failures require repair or a newly prepared operation.

## Agent handoff and Journey reuse

Connected workers claim bounded proposal work with leases and fencing. They do not execute Git/database/filesystem
mutations or manufacture receipts. Their assignment has records, pinned revisions and hashes, output schema, and
constraints only: it excludes repository/worktree paths, refs, commands, credentials, and provenance. Worker and
interactive proposal submission both validate and persist one complete record projection, move to
`WAITING_FOR_DECISION`, clear the lease, increment the operation version, and keep `acceptedDigest` null. A reviewer
must ACCEPT or REJECT the exact canonical review digest through the local UI or a one-action receipt-protected
public decision. Acceptance persists the designated proposal artifact; merge and database steps never select a later
proposal. Rejection cleans the exact original proposal worktree, or blocks and retains it when verification fails.
Final divergent cleanup proves both original and merge worktrees are absent. If no worker is observed, a single-use
operation ticket supports an interactive handoff: redemption atomically creates a short-lived synthetic connected
proposal worker and fenced attempt for that exact durably prepared RECONCILE operation. Its response contains only
the sanitized assignment plus the session and lease credentials needed by `work-complete`; ticket scope, repository
paths, refs, and credentials are never returned. Replay, expiry, cancellation, an occupied operation, or a replaced
fence fail. No native wake capability is claimed without host evidence.

Shared Journey content is advisory reuse only. A pinned brief creates a fresh, unlinked local draft. Analysis and
scenario seeds remain non-authoritative assignment advice and must pass normal local requirement, discovery,
publication, approval, consent, execution, and closure gates.

## V1 limitations

- Only collaboration records are eligible for automatic fast-forward or structured divergent reconciliation.
- Code conflicts require an external Git handoff.
- Rebase, force push, automatic stash/reset, and a general-purpose Git client are out of scope.
- Background checks run only while the Appraise service is active; no operating-system service is installed.
