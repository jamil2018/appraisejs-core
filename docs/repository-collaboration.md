# Repository Collaboration

Repository collaboration exchanges authored test aggregates through the committed `appraise/collaboration/`
directory. SQLite remains the local authoring authority: repository content is a validated, reviewed input and never
becomes execution or Quality Journey authority merely because it exists in Git.

## Setup and permissions

Open **Collaboration** for a registered local-workspace project and connect its repository root, remote, and tracked
branch. The repository root must exactly match the selected project's canonical path. One binding owns one portable
project identity; rebinding is intentionally unsupported in v1.

Observe and prepare permissions start enabled. Integrate, commit, push, resolve, and archive permissions start
disabled. Every mutation rechecks the current versioned grant. Only the local UI or an authenticated host transport
can record a trusted grant or decision; repository files and worker proposals cannot widen permissions.

## Exchange and review

The versioned manifest and one-record-per-aggregate files use strict allowlists, canonical JSON, portable IDs, and
bounded readers. Runtime URLs, credentials, absolute paths, runs, reports, and lifecycle approvals are excluded.
Step invocations retain exact local Step Definition IDs, versions, hashes, and inputs; missing prerequisites block the
whole import. Environment records are logical references and require an explicit local mapping.

Preparation compares incoming, local, and last acknowledged records. One-sided changes are candidates, equal changes
rebaseline, and unequal or archive-versus-edit changes require a whole-record Keep local, Use incoming, or validated
Edit decision. The accepted digest, local read set, policy version, and source snapshot are rechecked before apply.

## Recovery

Database records, mappings, baselines, before-images, and their receipt commit in one Prisma transaction. Filesystem,
Git, database, and remote effects cannot share a transaction, so Appraise records each external boundary and reports
partial progress honestly. Publication uses a sibling staging directory and verified backup; unexpected external
files or changed hashes block replacement. Recovery only finishes or restores a state proven by its journal.

Appraise never resets, stashes, cleans, rebases, force-pushes, bypasses hooks, or consumes unrelated staged content.
Authentication, signing, hook, and remote rejection failures require repair or a newly prepared operation.

## Agent handoff and Journey reuse

Connected workers claim bounded proposal work with leases and fencing. They do not execute Git/database/filesystem
mutations or manufacture receipts. If no worker is observed, a single-use operation ticket supports an interactive
handoff; no native wake capability is claimed without host evidence.

Shared Journey content is advisory reuse only. A pinned brief creates a fresh, unlinked local draft. Analysis and
scenario seeds remain non-authoritative assignment advice and must pass normal local requirement, discovery,
publication, approval, consent, execution, and closure gates.

## V1 limitations

- Only collaboration records are eligible for automatic fast-forward or structured divergent reconciliation.
- Code conflicts require an external Git handoff.
- Rebase, force push, automatic stash/reset, and a general-purpose Git client are out of scope.
- Background checks run only while the Appraise service is active; no operating-system service is installed.
