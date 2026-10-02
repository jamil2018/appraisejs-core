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
