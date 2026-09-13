# GC1 evidence — usable handoff gate

Date: 2026-09-13
Gate: GC1 — usable handoff
Verdict: `passed` after live blocker closure and independent exact-artifact review
Depends on: C1.1, C1.2 and C1.3 (`verified`)

## Exact acceptance

GC1 requires fresh setup/install, launch and fallback paths, early- and later-stage resume, and remote-target handling
to work end to end. This evaluation keeps setup, host launch, user Send, authenticated handoff redemption,
authoritative Journey reads, takeover approval, role claims and lifecycle authority as separate boundaries.

## Evidence reconciliation

| Acceptance area                     | Direct tests and source evidence                                                                                                                                                                                                                            | Live or human observation                                                                                                                                                                                                                                                                                                                                                                                                                          | Independent review                                                                                                                                                         | Verdict and limitation                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh setup and installation        | C1.1 package, compatibility, CLI, setup-capability and MCP-contract tests cover install state, stale/missing/disabled entries, malformed host state, permissions, contract/tool/resource diagnostics, manual MCP setup and uninstall.                       | C1.1 records isolated install/list/diagnose/uninstall and fresh-task production-plugin recognition, uninstall recognition loss, cache-busted reinstall recovery, hub-down failure, and authenticated diagnostic behavior. This GC1 run additionally obtained ready preflight receipt `cmtznqmi70003yem08n1lhwur` for the current surface, hash, tools, resources and target.                                                                       | C1.1 final exact tarball review passed after malformed-entry and stale-package repairs.                                                                                    | Satisfied. The retained installation is a development/package qualification, not a clean release installation; clean installation remains GC3.                                                                                    |
| Local launch and early-stage resume | C1.2 service, UI, presentation and guard coverage verifies encoded links, exact local workspace, minimal prompt, launch-requested versus connected state, one-time redemption and authoritative reconstruction.                                             | C1.2 records a local Appraise UI launch, explicit user Send, installed plugin recognition, authenticated redemption and authoritative Journey read. The task made no claim or lifecycle mutation.                                                                                                                                                                                                                                                  | C1.2 final exact-artifact review passed after remote-directory, launch-exit, expiry-presentation and documentation repairs.                                                | Satisfied. “Resume” here is connection and authoritative state reconstruction at ANALYSIS, not assignment admission.                                                                                                              |
| Launch and setup fallback paths     | Tests cover provider failure with retained copy prompt, expiry, wrong Journey/target/project fingerprint, tampered prompt, duplicate/racing preparation and redemption, archived/missing/unknown task fallback, and non-consuming rejection.                | C0.1/C1.1/C1.2 retain missing-plugin and unavailable-marketplace reporting, manual registered-MCP copy/paste success, declined protocol launch, unsent composer, natural expiry with no retry, uninstall/reconnect, and fresh-ticket recovery.                                                                                                                                                                                                     | Each C1 artifact received final independent acceptance; the GC1 judge reviewed their combined coverage.                                                                    | Satisfied. An actually absent OS URI handler was not separately uninstalled; protocol denial plus provider-failure/copy fallback covers the required recoverable product path without destructive host changes.                   |
| Later-stage reconnect and takeover  | C1.3 tests cover snapshot drift, archived/missing/unknown task fallback, reload, expiry, duplicate/concurrent flows, effect classification, lost-reply replay, transaction-local fencing, attempt-budget preservation and stale-session mutation rejection. | The GC1 closure trace used the current UI at `DISCOVERY`. Generation 1 connected; generations 2 and 3 exercised fresh scoped reconnect after known-task reopen was unavailable. Generation 3 was approved in the Appraise UI and became effective; generation 1 resume was rejected with `403 UNAUTHORIZED`, `operationOutcome: not_started`, `targetOutcome: not_committed`, `do_not_retry`. Journey version 6 and state hash remained unchanged. | C1.3's task review passed. The first independent GC1 review identified the missing later-stage trace; a second exact-artifact review accepted the added trace and verdict. | Satisfied. Connection, Appraise UI takeover approval, predecessor fencing, work claims and lifecycle authority remained distinct. Stock Codex known-task reopen remains unsupported; fresh scoped fallback is the qualified path. |
| End-to-end remote-target handling   | C1.2 tests verify unique `0700` neutral host directories, normalized URL target preservation, local/remote isolation and mocked remote provider launch/redemption.                                                                                          | The blocker-closure Journey was bound to remote target `https://c01-handoff.invalid` and project `5d0a704c-6fde-4cf6-96a7-77340bb714bb`. The current product UI prepared each handoff and opened stock Codex in a neutral temporary host directory; the user explicitly sent each copied prompt. Codex authenticated, redeemed and read the URL-bound Journey at `DISCOVERY`. No remote filesystem was invented or target browsing performed.      | The first GC1 review rejected the earlier composite evidence; the second independent review evaluated this exact current-product remote trace.                             | Satisfied. The same trace covers launch, explicit Send, redemption/read, reconnect, Appraise UI takeover and stale-predecessor rejection end to end.                                                                              |

## Fresh verification on the evaluated artifact

Source identity: branch `codex/managed-quality-journey-coordinator-p0`, base/HEAD
`74cd7d1f14aa32ad3cf6eb3f5f67338776d95aa2`, retained dirty implementation and audit fixtures. Codex CLI
`0.154.0-alpha.6.2`; package `appraisejs@0.4.0`; current MCP surface
`2026-09-06.quality-journey-authority`; current contract
`sha256:862789cac3c10fa99b837051887ab2988e325e46824cc68ec9675cb503f5cd3c`.

- Authenticated `project_diagnostic`: ready; application, identity, authentication, transport, exact contract,
  required tool/resource sentinels and target binding passed. Receipt `cmtznqmi70003yem08n1lhwur`; dirty Git state was
  the only warning.
- `npx vitest run` over the handoff SQLite integration, locator fencing, Journey handoff panel, presentation, route
  guard and request guard: PASS, 6 files / 77 tests.
- Focused `packages/appraisejs` compatibility, MCP contract and coordinator-session schemas: PASS, 5 files / 31 tests.
- Focused scaffold template-sync test: PASS, 1 file / 8 tests.
- `git diff --check` for the gate documents: PASS before the GC1 edits.

The earlier C1 artifacts also record passing full validation, build, migrations, release artifact/package checks,
template synchronization and broader Journey suites. Those results were reused rather than rerun because this gate
changes only planning/evidence documents and the focused current-artifact tests cover the acceptance boundary.

## Limitations and untested assumptions

- This is a usable-handoff gate, not lifecycle completion or release qualification. GC1 does not certify role claim,
  submission, authenticated discovery, execution, triage, cancellation, provider-process recovery, data upgrades or a
  clean release install.
- The live remote fixture used the reserved invalid origin `https://c01-handoff.invalid`; target identity and authority
  were exercised without visiting or testing the target application.
- Directly loading the Journey URL while another project remained active produced `Quality Journey not found` until
  the active project was switched through the project selector. This is an observed current UI-binding limitation.
- Reloading after generation 2 redemption discarded the page-local takeover control although authoritative MCP state
  still required approval. The qualified recovery is a fresh scoped handoff followed by the same-page update path;
  generation 3 proved it. Durable post-reload takeover approval remains a product limitation, not a GC1 pass claim.
- The absent-URI-handler case was not produced by removing the user's handler. Recoverable protocol denial and
  launch-provider failure were observed/tested with retained copy fallback.
- Independent reviewer context and sandbox properties are requested by the host but are not treated as attested
  unless the host supplies a matching runtime receipt.
- Existing uncommitted implementation and audit fixtures reduce clean-build reproducibility; they are intentionally
  preserved. GC3 owns clean-install and release-level identity.

## Independent GC1 review and blocker ownership

The transcript-free independent judge first returned `REVISE`, correctly identifying that the prior live takeover
remained at `ANALYSIS` and the earlier remote trace predated the current built-in launcher. `GC1-B01` was then
exercised through the exact current artifacts above. A second transcript-minimized independent judge reviewed this
updated evidence, PLAN and TASK_REGISTER and returned `ACCEPT`. The review retained the observed project-binding and
page-reload limitations rather than inferring capability from tests or configuration.

## Gate decision and progression

GC1 `passed`; `GC1-B01` is closed by the current-product remote `DISCOVERY` trace. C-B01 remains closed as an
implementation-delivery blocker by the verified C1.1-C1.3 scope. The C1.3 handoff/reconnect portion
of C-B03 remains closed; C3.1 retains provider/process recovery and owned-stop coverage.

C2.1 remains `pending`, is now eligible, and was not started. Handoff redemption and takeover do
not claim a role, authorize submission, or replace Appraise-owned lifecycle decisions. No commit, push, publication
or release occurred.
