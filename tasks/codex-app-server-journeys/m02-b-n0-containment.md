# M02-B-P3 N0 containment prerequisites

Date: 2026-10-15 (Asia/Dhaka). **BLOCKED_FEASIBILITY for runtime eligibility.**
This document fulfills N0's prerequisite-record scope, not containment qualification. Read
[authority and inventory](m02-b-n0-inventory.md), [B07 feasibility](m02-b-n0-b07.md),
[P3](m02-b-p3-plan.md) and the frozen [M00 contract](m00-host-authority-contract.md).

## Trust boundary and evidence status

The trusted supervisor, synthetic provider and scoped gateway would own policy, counters, canonical
submissions and evidence. An untrusted worker must have only brokered role-scoped MCP access plus
exactly reviewed provider transport. The current adapters are disconnected offline contracts;
there is no actual worker, process/socket composition or OS enforcer in N0.

| Boundary                   | Candidate enforcer to assess later, not selected      | Required evidence                                                                                        | Current status                                 |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Process identities         | Supervisor-owned isolated worker process/compartment  | Exact process tree, identities, ownership and lifecycle on pinned tuple                                  | UNKNOWN                                        |
| Environment/FDs            | Sanitized launch and closure of inherited handles     | Effective environment/FD inventory; denial of access to supervisor/provider protected state              | UNKNOWN                                        |
| Mounts/files               | OS-enforced worker filesystem boundary                | Effective mounts; denied repository/source, SQLite, real home/auth/history and supervisor/evidence reads | UNKNOWN                                        |
| Symlinks/races             | OS boundary plus no-follow ownership checks           | Denial across links, path traversal, replacement and race into protected paths                           | UNKNOWN                                        |
| Exec/children              | OS process policy                                     | Denied shell/exec/spawn and child escape; no generic executor authority                                  | UNKNOWN                                        |
| IPC/provider path          | Separately reviewed supervisor broker/provider state  | Actual channel topology and worker exclusion from provider secrets/direct state                          | BLOCKED: composition absent                    |
| Network                    | Worker egress denial; supervisor-only exact endpoints | Effective egress/socket rules, including separation of loopback access                                   | UNKNOWN                                        |
| Native tools               | Exact descriptor allowlist plus effective denial      | Complete captured descriptors; observed confinement of any exposed broad tool                            | BLOCKED: descriptors and enforcement absent    |
| Ambient skills/plugins/MCP | Isolated effective configuration and scoped broker    | Full effective manifest and denied ambient discovery/calls                                               | BLOCKED: effective boundary absent             |
| Cleanup                    | Supervisor-held handles and fenced reconciliation     | Owned interruption/exit/deletion, preserved uncertain effects; no stored-PID signalling                  | UNKNOWN                                        |
| Credentials                | Provider state inaccessible to worker                 | Real credential isolation/revocation evidence without copying secrets                                    | UNKNOWN; outside synthetic M02-B qualification |

A dedicated guest/OS-enforced worker compartment and a native macOS process sandbox profile remain
comparison candidates only. Neither is selected, installed, configured or tested. Support on the
recorded macOS 27.0.1/26A434/arm64 and compatibility with Codex 0.162.0-alpha.17.2 are UNKNOWN.
The table states required properties, not a claim that either candidate supplies them.

## What existing evidence does and does not show

[M01's corrected manifest](m01/corrected-manifest-host-observation.json) retains broader
`functions.exec` and collaboration names at `input[0].additional_tools`. It establishes that exposure
in the saved manifest summary, not their execution, complete schemas or host isolation.
[Recorded static inspection](m01/manifest-offline-diagnostic.json) associates CodeModeOnly/Lite
model metadata with the pinned executable despite disabled Code Mode configuration. It does not
establish effective mounts/process/network/credential denial. No configuration-only conclusion
can erase that negative evidence.

B1's owned disposable storage tests established private state, reserve-before-send acknowledgement,
failure fencing and inode-based cleanup checks for their fixtures. They did not prove power-loss
recovery or resistance to hostile same-UID path races. Stream/catalog/empty-denial tests did not
create an OS boundary. Fake credentials cannot establish real provider credential isolation.
Unregistered, invocation-rejected, OS-effect-denied, effect-occurred, unreached and UNKNOWN remain
separate classes; an absent handler or model refusal is not OS denial.

## Bootstrap prerequisite and stop

Native mapping needs full descriptors; the named saved record set lacks them. If only a new scripted
turn can expose them, a zero-turn preflight cannot be claimed sufficient. That fact does not authorize
launching a discovery turn under configuration-only controls. First prepare and independently review
an offline containment and transport-composition proposal with effective-enforcement evidence needs.
Any later capture must use a separately reviewed exact E0 artifact and explicit user authority.
If a viable boundary cannot be justified, report BLOCKED_FEASIBILITY and stop rather than weaken M00.
Source-derived schemas must retain their source-derived label and cannot become captured evidence.

An eventual E0 approval must specify binary/platform/schema/enforcement pins; owned exclusive root
and modes; exact private-stdio child counts; approved loopback endpoints/listeners; environment/FD
allowlist; protected synthetic canary topology; durable start counters; bounded sanitized retention;
owned-handle interruption/cleanup; and zero retries/replacement starts. No auth inheritance, generic
shell/network permission, real database/source/credential escape target or native/external inference
is implied. B14 needs a fresh asking-only exception with zero grants. Unexpected requests/effects,
ambiguity, ownership loss, counter/deadline exhaustion or uncertain cleanup fence the whole run.

N0 authorizes zero runtime launches, sockets, probes, starts or requests. It supplies no E0 budget
and never resets M01's exhausted native 3/3. No enforcer is selected or implemented. Any enforcement
change, accepted-artifact edit, native mapping/B07 revision, runtime collection or M02-C+ requires a
separate bounded authorization. M02 remains incomplete and product dispatch remains unauthorized.

## Judgment and preservation

Read-only solver judgment: confidence high that current evidence cannot qualify runtime eligibility;
confidence low in either candidate's platform feasibility. The rejected alternatives are probing
under configuration-only controls, treating generic Code Mode as scoped authority, promoting fake
canaries to credential-isolation evidence and weakening M00 to unblock collection.

Acceptance of N0 can cover this accurate unresolved prerequisite record only. It does not select a
mechanism or clear any row. Prior accepted bytes, UNKNOWN/historical evidence, M00 hash, GC3 REVISE,
prior review outcomes and HEAD remain unchanged; see the inventory for preservation and review scope.
