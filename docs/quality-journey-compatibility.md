# Quality Journey storage and client compatibility

The supported stock-Codex path retains Journey IDs, immutable revisions, assignments, approvals, consents,
interruptions and sealed evidence. Compatibility checks never reset storage or transfer ownership. Historical
provider prototypes remain opt-in research paths; the generated default MCP contract excludes provider-native runs.

## Storage upgrades and refusal

`npm run migrate-db` inspects the configured SQLite database and committed migration history before Prisma deploy.
`npm run dev` performs that guarded upgrade before runtime readiness writes. `npm run start`, `npm run dev:web`
and `npm run init` require current storage before serving or readiness writes. A missing database is created only by
an explicit upgrade. Known pending migrations require backup and the matching application upgrade command.

Unknown migration names, changed checksums, unfinished migrations, duplicate completed entries, non-contiguous
history and populated databases without migration history refuse startup/upgrade. Refusal does not repair, reset,
roll back or adopt storage. Use the matching newer application and retain a backup; do not delete migration history
to bypass refusal. These guards cover the supported scripts in this version. Arbitrary older binaries, bare Prisma,
direct Next invocation and direct database writes are outside this guarantee. A matching migration ledger is not a
full physical-schema drift audit; Prisma failures still require diagnosis rather than reset.

The C3.1 migrations add nullable stop/output observations and an initially empty owned-browser ledger. Upgrade
cannot infer host cleanup from an empty new ledger. Persisted uncertain managed launch, lease expiry and assignment
ownership still require the existing Journey recovery/reconciliation paths. Existing active external assignments
retain their principal, generation, lease and input revisions; upgrade does not renew or take them over. Expired
assignments require authoritative reread and separately authorized replacement, retaining predecessor lineage.

## Disconnect, uninstall and reconnect

Use `appraisejs agent disconnect --cwd <hub> --json` to revoke access to that hub, or
`appraisejs agent plugin uninstall --cwd <hub> --json` to revoke first and then remove the skills-only plugin.
A tokenless disabled coordinator file prevents existing cached credentials and new clients from admitting hub
operations. Removal failure does not undo revocation. Journey storage and all assignment/evidence rows remain intact.
The separate Codex MCP registration may remain configured but its old credential is inert. Raw
`codex plugin remove` removes guidance only; it cannot revoke Appraise access.

Explicit `appraisejs agent reconnect --cwd <hub> --json` rotates the credential. Reconfigure HTTP authorization
through `agent setup --json`, reconnect the MCP transport/start a fresh task, then call `project_diagnostic` with
observed capabilities. Neither reconnect nor plugin reinstall changes assignment ownership or lifecycle approval.
Existing stdio clients must reconnect after rotation; they cannot silently acquire the new credential.

Revocation stops new mediated admissions after the file is read. Already admitted requests and owned execution
require local Journey pause and C3.1 reconciliation; revocation does not cancel them or attest external Codex stop.
Unknown owned processes remain blocked; never signal a persisted PID. Same-user filesystem credential replacement
is outside this boundary. The three earlier C3.1 lost-ownership fixtures remain unresolved; complete host cleanup is
not claimed.

The packaged guidance revision is `0.4.0+codex.c12-20261003`; the prior c11 revision is an explicit upgrade candidate.
Plugin version checks detect old guidance without changing assignment or MCP authority.

## Client and host matrix

| Configuration                                    | Behavior / assurance                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS 27.0.1 arm64; Codex CLI 0.159.0-alpha.12.1 | Version observed on this host; plugin/MCP capabilities must still be diagnosed. CLI inventory is not desktop task/schema or liveness attestation. |
| Other, unknown or malformed Codex versions       | Unqualified; capability diagnostics and explicit reconnect/upgrade guidance required. No inferred compatible version range.                       |
| Current enabled plugin and expected marketplace  | Eligible for fresh-task diagnostics; no automatic Journey connection or role admission.                                                           |
| Older recognized plugin                          | Explicit install upgrades guidance; current task must reconnect.                                                                                  |
| Newer or unorderable plugin                      | Install refuses replacement/downgrade; preserve installed plugin and use the matching package.                                                    |
| Current observed MCP surface and contract hash   | Preflight can report current; full server-side canonical argument and authority validation still applies.                                         |
| Stale observed MCP schema/hash                   | Preflight reports stale and reconnect required; invalid/stale operations cannot bypass canonical validation.                                      |
| MCP schema not reported by task                  | Unverified, never a claim that the model captured the exact schema.                                                                               |
| Plugin removed, MCP still configured             | Guidance absent; raw removal alone is not revocation. Appraise uninstall/disconnect supplies the credential boundary.                             |
| Reinstall/reconnect                              | Fresh credential and authoritative read required; no automatic takeover, approval reuse or launch replay.                                         |

The scoped qualification and deterministic/live distinctions are recorded in
[the C3.2 evidence](../codex/development%20plan/appraise-0.5/product%20direction/managed-quality-journey-coordinator/evidence/C3.2.md).
This compatibility matrix is not a clean-installation/release verdict. C3.3 and GC3 remain separate.
