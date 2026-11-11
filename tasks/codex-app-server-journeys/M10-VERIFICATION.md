# M10 — internal Triager and lifecycle verification

Verified on 2026-11-11 within the requested disposable internal scope. Branch: `codex/m10-triager-lifecycle`.
The isolated worktree is `.appraisejs/m10-worktree` beneath the original repository. The freshly fetched base was
`38c2ca82ee52bdfba843d1e802fe81ab09d0e8d1` (short identity `38c2ca82`; the Git ancestry check is authoritative).
It contains M06 PR #307 (`e8adf05b`), M07 PR #308 (`84fce1cd`), M08 PR #309 (`308660c7`) and M09 PR #310 (`38c2ca82`).
Existing worktrees, unrelated root edits and M06 custody/STOP/spent-attempt evidence were preserved.

## Canonical implementation

- Read-only Triager readiness binds the active specialized assignment, approved scenarios, exact terminal execution
  cycle, sealed evidence, input-artifact references and human predecessor-report feedback. Fresh claim/admission
  checks it before consuming authority. Generic managed claims cannot admit internal Triager work.
- The repository-only scoped MCP grants context, bounded sealed report/log reads and specialized report submission.
  Appraise derives the attempt's report identity. Fresh canonical service acceptance enforces it and the complete
  lineage transactionally, including direct versioned ingress. Exact authenticated outcome replay remains available.
- Evidence reads compare the assigned receipt hash and actual bytes, recheck frozen inputs and the current worker
  session before and after I/O, and do not advance coordinator ownership versions. Pause/transfer during I/O refuses.
- Actual managed runtime integration required a fixed internal result-publication child. It verifies terminal bound
  TestRuns and complete sealed receipts in the same transaction, retains the ownership CAS and staged E2 refusal,
  constructs only `PUBLISH_RUN_RESULT`, and issues no work. It does not synthesize coordinator credentials or use
  human authority. The capsule executor now resolves its supervisor from application source instead of data storage.
- Existing human report revision, rerun approval, separate fresh consent and exact closure controls retain authority.
  Agent exit, turn completion and generic work completion cannot establish test success or publish a report.

See [the current contract](../../docs/quality-journey-internal-triage.md).

## Actual disposable local browser flow

The synthetic target bound to loopback only. Initially `/checkout` redirected to `/failed`; the fixture was then
corrected to serve `/checkout`. The existing Cucumber/Playwright RuntimeCapsule executor ran the same approved
navigation/reload/route-assertion scenario in two immutable execution cycles.

| Durable record                                     | Observed result                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Journey `qjy_906ce2e0-29fc-44e6-b89d-749404834472` | `CLOSED`                                                                                      |
| Initial run `d86ae1e0-4a9c-4284-bda0-970266a3f892` | `COMPLETED`, `FAILED`, evidence `valid`                                                       |
| Initial report `qjt_410acbadb1539a44c68d42fe`      | Accepted through scoped MCP; human full-report revision requested in UI                       |
| Revised report `qjt_85153cf2b4899d616a3a23ea`      | Accepted through scoped MCP with exact predecessor/feedback                                   |
| Initial consent `qjec_6f3c6c16562f43af9091c03c`    | Consumed only by initial cycle                                                                |
| Rerun consent `qjec_dc45b3d4836014ab567e6bf0`      | New exact scope requested after human rerun approval, granted in UI and consumed by successor |
| Rerun `a3327532-4fd1-4d75-ab2d-c1bb0531441b`       | `COMPLETED`, `PASSED`, evidence `valid`                                                       |
| Passing report `qjt_cc9a7dc99eb01b52d60fcbb0`      | Accepted through scoped MCP from successor evidence                                           |
| Closure `qjc_bb2f6ec9174646490e4f8074`             | UI approval of exact passing report; zero unresolved items                                    |

The Browser skill was absent from the installed catalog; plugin discovery did not provide the bundled Browser
surface. The documented `playwright-cli` fallback exercised the actual Next UI forms. The final browser session
reported zero console errors/warnings and successful local requests. Earlier server-restart navigation errors belong
to retained abandoned-fixture sessions. A closed-Journey screenshot was visually inspected.

The successful fixture uses a fresh migrated SQLite database and real canonical intake, Analysis, Discovery,
scenario approval and materialization. Discovery observation is a deterministic injected browser fixture, not a live
protected session. Step Definition publication/readiness receipts are explicitly local fixture evidence. Triager
content is a deterministic proposal delivered through real scoped MCP transport, not provider inference. UI decisions
record local user possession (`USER`), not independently established natural-person identity.

Two earlier disposable fixtures are retained: one failed because fixture Step Definitions lacked publication
metadata; another retained an unresolved `CANCELLING` attempt after the missing-supervisor path was observed.
Neither attempt was replayed or converted to success. The successful flow started fresh after those corrections.

Local ignored evidence lives under `.appraisejs/m10-live/` in this worktree: sanitized `verification-summary.json`,
`final-state.json`, `closed-journey.png`, retained fixture pointers and `evidence/` command logs. The local driver is
`node --import tsx scripts/m10-local-flow.ts prepare|inspect|triage`; preparation creates new disposable state and
retains the prior pointer. It is a verification fixture, not a production provider or dispatch entry point.

## Deterministic and repository checks

- M10 migrated-SQLite suite: **4/4 passed**. Covers direct-ingress/scoped-MCP parity, forged identity/cycle/predecessor/
  evidence linkage, generic claim refusal, stale/foreign assignments, invalid/expired grants, report revisions,
  exact and changed replay, expired/reused consent, stale closure and atomic runtime refusal/rollback (including E2).
- Evidence-read/route/executor focused suites: **38/38 passed**, including changed bytes, replacement receipt hashes,
  pre/post-I/O transfer/pause refusal and executable-source resolution.
- Whole root unit suite before the hook-required structural refactors, with required host access: **350 files passed; 3416 tests passed, 4 skipped**. The initial
  sandbox run failed at process/browser/socket boundaries; it is retained separately and is not the passing evidence.
- MCP package: **295/295 passed**. Scaffold package: **167/167 passed**.
- TypeScript check and repository build passed. Full ESLint passed with zero errors. Its 35 warnings include existing source warnings and generated disposable
  capsule warnings; focused changed-source ESLint is clean.
- Harness and documentation-link checks passed. Canonical scaffold preparation, generated-artifact policy and packed
  package inventory checks passed; packed scaffold contains the exact 97 migration names and SQL hashes.
- Graphify source graph refreshed; the large graph uses its generated tree view. Repository-only Triager gateways,
  M10 fixtures and driver remain excluded from scaffold outputs.
- Final refactored-artifact regressions: **87 passed, 2 skipped** across seven canonical, M09/M10 and read suites;
  shared-gateway regression set: **16/16 passed**. The actual closed browser fixture above also predates these structural
  refactors; final focused tests verify the retained behavior. Final build and TypeScript checks passed.
- Independent final review accepted code receipt `6ff26d11eb11414346bc84cb2556328d9ddde3d586bfd6674a5f3ddd0567ab41`,
  independently reproduced from all 19 listed source files. No blocking finding remains.
- Actual staged pre-commit hooks passed: Fallow introduced no blocking finding; React Doctor **100/100** over 31 changed
  source files. No suppression, baseline relaxation or hook bypass was introduced.
- Focused Prettier passes for the other changed source/docs. The two existing canonical service files retain their
  baseline whole-file Prettier drift (both base and current checks return false); unrelated historical formatting was
  restored deliberately to keep the change scoped.

## Limits and remaining gates

This completes M10 repository implementation and disposable verification only. Runtime/provider qualification remains
open. No real provider inference, live protected access, production dispatch, public managed opt-in, M11+, push, merge
or release was performed. M08 browser/access/E2 boundaries, M07 polling/project/exact-form/external-handoff rules and
M09 exact scenario approval/frozen resources/separate execution consent remain applicable.
