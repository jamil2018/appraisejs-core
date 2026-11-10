# Test Run Runtime

Every TestRun executes from an immutable runtime capsule with an exact command receipt, selected cases, Step
Definitions, locators, environment identity, and expected-case manifest.

There are two execution intents:

- `QUALITY_JOURNEY`: created by a Journey execution cycle and required to have the exact
  `QualityJourneyExecutionTestRun` binding. Its output becomes usable only through Journey-owned evidence sealing,
  triage, report review, and closure.
- `INDEPENDENT`: created from a target-owned authored snapshot and required to have no Journey binding. Its output is
  diagnostic and cannot satisfy Journey evidence, triage, decisions, or closure.

Both paths share capsule materialization, immutable blob storage, preflight, execution-attempt ownership, process
management, logs, and reports. A remote target uses its frozen non-secret environment packet; mutable environment
state is never substituted after sealing.

For a Journey capsule, the runtime reader verifies the complete frozen source and binding hashes before adapting
legacy resource entries with provenance fields to runtime `id`/`contentHash` pairs. It similarly verifies a legacy
bare step action before adding its frozen Step Invocation keyword for Gherkin generation. New Journey preparation
emits keyworded steps and lean resource entries directly. The generic file generator remains strict about allowed
single-line Gherkin steps.

Journey execution first reserves an exact cycle and TestRun, then claims launch before materialization or process
effects. A lost reply reuses those identities; an uncertain claimed launch is not respawned. Reconciliation accepts
only terminal Journey-intent runs with the exact cycle binding and verifies the capsule manifest and artifact bytes
before creating a sealed receipt. Runtime traces and report-step screenshots live in the sealed `reports/traces`
and `reports/screenshots` subtrees. Each screenshot is bound to its report step and test case in the Journey receipt.
Previously persisted v1 command receipts with `traces` and `screenshots` roots remain readable under their exact
legacy paths; new receipts name the runtime's actual `reports/*` locations.

Successful reconciliation also terminalizes the run binding from the terminal TestRun result. A sealed-cycle replay
may repair a stale active binding only when every bound TestRun is terminal and covered by an exact sealed receipt;
it does not re-seal evidence or relaunch execution. The read projection reports ownership loss only for a live cycle
with a nonterminal TestRun. Closed Journeys remain immutable and cannot run a repair command afterward.

There is no published-Assessment capsule source or reconciliation branch. A mismatch between intent and Journey
binding fails before materialization or process launch.

## M06 execution resource reservation

The E2 reservation implementation remains behind `UNSUPPORTED_E2_INVALIDATION`. Within its owning transaction,
the exact execution cycle is inserted before its distinct `EXECUTION_CYCLE` shared-resource Use is resolved and
acquired through the registered business-owner callback. Complete claims become ACTIVE before the consumed-consent
link, TestRuns, execution/run bindings, and lifecycle or rerun-proposal publication. Errors roll the whole owner back.
This source integration does not admit production E2 execution or replace the current physical-dispatch fence.

A rerun selects the approved immutable predecessor snapshot. Its prepared capsule, materialization artifact, binding,
producer session/generation, work and authorization lineage are verified against their retained original records.
The producer's old cycle/session and current authored Case/Suite/step content do not replace the frozen execution
packet. An old released source or predecessor Use is provenance only; it is neither required ACTIVE nor resurrected.
The new cycle acquires a distinct Use under the original current caller credentials, with fresh complete dependency
descriptors, all five coverage domains, selected guards and exact frozen Locator/StepDefinition/operation/effect checks.

Exact same-cycle replay validates the existing complete ACTIVE Use without acquiring, repairing, or recreating one.
Missing, released, corrupt or wrong-provenance Uses refuse, including replay from a later coordinator generation.
Consent waiting creates no cycle, Use or run. Legacy behavior retains its existing path. The R07/R08 consumers
below use the retained reservation. Production runtime and provider qualification remain separate work.

Synthetic SQLite composition tests substitute only the no-invalidation preflight and retain the real business owner,
admission/retirement, reconstruction, descriptors, acquisition and transaction rollback. Separate tests exercise the
actual public fence and require zero adapter entry. An inert adapter recorder in successful synthetic composition is
not production admission or physical dispatch evidence.

## Protected target authentication

Managed runs begin with a fresh browser context. A Discovery protected-return receipt does not transfer cookies,
storage or sign-in authority to it. Use an independently authorized target login supported by the selected scenario.
The frozen Environment packet records a credential reference and its scope version; the command receipt resolves
that process environment reference as `APPRAISE_ENV_PASSWORD` at preflight without persisting the credential value or
a credential-derived hash. The canonical `browser.forms.fill.configured.credential@1` operation accepts only a
locator and checks the sealed target origin before filling it. Its `CREDENTIAL_USE` effect requires Appraise UI consent
bound to the exact Environment snapshot and prepared capsule; a rerun needs its own consent.

Credential-bearing scenarios suppress Playwright traces. Failed-step screenshots remain enabled, so qualification
must inspect them for disclosure and keep intentional failures after credential entry has completed. Human IdP
credentials and MFA codes remain in the Appraise-owned headed Discovery browser. A distinct fixture automation
identity must be reported separately from human Auth0/MFA; neither the Environment reference nor consent alone
proves that a live protected managed run authenticated successfully. The disposable
[protected checkout fixture](../scripts/fixtures/qualification-targets/protected-checkout/README.md) exercises this
boundary without adding a production session-import path.

Triager text evidence reads authenticate the exact live leased attempt before resolving sealed report or log bytes.
Managed attempts use their owner-token verifier and validated spawn receipt. Admitted `EXTERNAL_V1` attempts use
the domain-separated assignment-secret verifier and canonical admission request/receipt bound to the Journey,
target, work item, attempt, authorization and lease; they do not require or fabricate a Factory spawn receipt.
Both paths reject malformed stored verifiers, expired leases and changed artifact bytes. External admission records
`hostIsolation: NOT_ATTESTED`; successful evidence access does not establish host isolation.

## Operational pause and owned cleanup

See [Quality Journey pause and recovery](quality-journey-recovery.md) for operational admission fences, durable lost-reply recovery, deferred terminal publication, and observed owned-process cleanup. Cancellation requests alone are nonterminal; external Codex activity remains outside Appraise process ownership.

## Synthetic outcome-source verification

The internal provider custody path has a separate [source-custody contract](quality-journey-source-custody.md). It uses the original canonical Prisma writer for asynchronous source persistence and canonical commits, while synchronous original transport capture issues no SQL. A final conditional source write barrier and bounded same-transaction verification establish fresh release authority. A preowned committed-read resolver and actual resource holds preserve exact replay and UNKNOWN outcomes without retry or cleanup-induced loss.

Its ordinary Node/SQLite fixtures are offline repository verification. Native contenders and database inspectors use separate processes; ambiguous owners remain retained, and crash recovery preserves original database and journal bytes before any reviewed recovery copy is opened. This scope does not run or qualify a provider, authenticate a target or enable production dispatch.

The M06 SQLite suites that require a fresh owned case run through their generated harness configs. Default Vitest
discovery excludes those seven suites because a normal checkout has no case manifest or case-scoped mirror.
The four source- and service-custody suites are also opt-in through `APPRAISE_PINNED_SOURCE_CUSTODY=1` when running
Vitest. They require their reviewed inputs, including the macOS ARM64 migration tuple for source custody and the
exact generated client binding for service custody. The runners retain their STOP boundaries if those inputs change.

### M06 retained Journey source capture (R07/R08)

Journey capsule source reads are rooted in the persisted TestRun database ID. The reader checks the exact
`QUALITY_JOURNEY` run, unique execution binding, frozen cycle selection, target, environment packet and case/suite
identity links inside one read-only transaction. Protected E2 reads require that cycle's deterministic ACTIVE
execution Use, complete exact claims, current complete descriptors, coverage, guards and current retained session
lineage. This integrity check does not reconstruct caller credentials, authenticate a new caller, acquire a Use,
advance epochs or authorize publication. Original entry authentication and M03 ownership guards stay with their
existing owning services.

Retained producer cycle/session and frozen Case/Suite/step bytes remain source provenance. A later execution cycle
has its own Use; a released predecessor Use is never resurrected. Missing Use does not imply legacy: the existing
all-null/no-orphan enrollment observation and every retained producer lineage must positively prove legacy, with
no contradictory E2 association. Missing capabilities, partial lineage or contradictory provenance refuse. Positively proven legacy retains the original frozen reader and sealed-definition/resource-byte checks,
including supported rich resource-hash records, verified explicit no-session producer provenance, an older producer
or execution cycle and the prior sealed deprecated-scalar behavior. Strict R06 reconstruction, current-cycle/session
lineage and current Use/complete descriptor requirements apply to protected E2. UNKNOWN or E2-associated lineage
cannot enter that legacy branch.

Journey materialization captures the verified frozen selection and the exact sealed StepDefinition and Locator
objects in that transaction, then rereads source/claims/descriptors and captured bytes before returning. Current
Case/Suite/step content is queried for complete descriptor integrity only; it cannot replace frozen selection,
title, description, steps or invocations. The pure compiler consumes copied captured inputs, without a subsequent
root-client source lookup. Independent authored selection keeps its existing behavior.

A read snapshot proves only its captured database state. E2 materialization still refuses with
`UNSUPPORTED_E2_CAPSULE_PUBLICATION` before command sealing, manifest refresh, lease, blob, file or capsule-row
publication. R09 must supply its separately accepted actual owning admission and revalidation before those effects
can proceed. Source capture does not grant publication, pre-spawn or physical runtime authority.

Fresh synthetic R07/R08 tests compose real SQLite and the R06 reservation/acquisition path using the bounded
R06 test substitution of only the no-invalidation preflight. Response-only corruption tests are labeled separately
from actual SQLite writes. Legacy/independent compiler assertions stop at a synthetic command-sealing sentinel,
before runtime identity or credential resolution; they are compiler evidence, not full publication qualification.
R06, R07 and R08 are integrated in the M06 repository scope. The historical verification records cover their
observed inputs and outcomes. Production E2 reservation, physical dispatch and runtime/provider qualification
remain separate.

### R09 Journey admission source gate

Each existing Journey reserve, pre-spawn and post-spawn registration transaction repeats the exact TestRun-ID-rooted
retained execution-use read through the private launch assertion. The persisted binding/cycle/Journey supplies the
business scope. The read-only conservative business refusal runs before the existing ACTIVE/version Journey fence
and the caller's original mutation. Only a positively proven legacy source may continue; protected E2 remains
`UNSUPPORTED_E2_INVALIDATION` even if a later enrollment observation appears legacy. Neither the retained hash nor
the legacy fence is a grant, authenticated owner or publication permission.

Reserve refusal rolls back that transaction's writes. Pre-spawn refusal retains the existing separate cancellation
and exact never-started evidence path before adapter execution. Post-spawn registration refusal retains the existing
owned-stop and scoped observation path; SQL rollback cannot undo an already started process. Failed or unknown stop
does not authorize restart, replay, release or a fabricated never-started outcome. Terminal, cancellation, stop and
historical evidence callbacks retain their prior exact run/attempt/owner scope without a new ACTIVE Use condition.

R09 retains the upstream and production issuer refusals. Unit-composition and retained-reader evidence cover the
specific source and transaction boundaries under test. Protected E2 publication and physical launch require
separate qualification.

## Exact Journey launch and retained scenario identity

Journey launch captures the retained run, cycle, prepared capsule, binding, intent, target and resource-use identity
inside the existing launch-claim transaction. This inert copied identity is forwarded through the specialized launch
boundary and compared with a fresh retained validation before materialization and in the existing reservation,
pre-spawn and post-spawn owners. Operational status, timestamps, use versions and `runSourceHash` are excluded from
the stable identity. Current session, generation, retirement, use and claim checks still apply independently in each
owner. An interrupted `LAUNCHING` claim never grants permission to respawn, and protected E2 execution retains its
`UNSUPPORTED_E2_INVALIDATION` refusal before physical effects.

Journey status events, report-case associations (including screenshot membership), and evidence summaries use the
same frozen `expectedCases` tuples and captured `source.snapshot`, joined to the exact retained cycle, prepared
binding, run and run-case/suite links. Each scenario needs exactly its captured validation/suite/case tag triple.
Names and current tags cannot redirect these associations. Whole reports require one occurrence of every captured
tuple; conflicting tags, duplicates, unexpected scenarios and omissions refuse authoritative report associations and
valid evidence health. Missing or corrupt immutable metadata refuses without live fallback or historical backfill.
The status callback uses its captured database run ID, execution run ID and owned attempt, and conditionally updates
only the exact retained case link while that attempt still owns the open output range.

Retained matching does not query current active uses or sessions: authenticated release, retirement or session
supersession does not change captured selection identity. Ordinary history and independent-run matching remain
available. Contradictory Journey binding/source metadata with independent intent refuses authoritative matching.
Artifact bytes, terminalization, business publication, physical effects and release remain subject to their existing
custody and admission boundaries; a frozen match grants none of those authorities.
