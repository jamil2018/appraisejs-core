# Internal Scenario Designer and Automator (M09)

The local Journey buttons **Design scenarios with local Codex** and **Prepare approved tests with local Codex** use these specialized submissions. The server owner enables these two roles with `APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED=true`. See the [operator guide](quality-journey-operator-guide.md).

The local CLI returns structured scenario content or automation choices. Appraise supplies the assignment identity, hashes, lineage and operation bindings and validates the resulting canonical submission. If a returned candidate was retained but publication was interrupted, **Recover retained proposal** uses the original candidate and checks its existing receipt. It never resends the native task. The control is scoped to the matching active assignment or pending publication.

Every proposed scenario must reference at least one captured Discovery observation. Native generation constrains
those references to the current accepted observation IDs and enforces the required array bounds. Unsupported
coverage belongs in coverage limitations rather than scenarios with invented or empty evidence. Appraise retains
the bounded normalized structured output before deeper content validation, including when that validation rejects it.

For a completed Designer turn rejected by schema validation before any canonical submission, **Create corrected
design assignment** reconciles only that proven rejection. It preserves the original failure and dispatch timestamps
in an event, keeps the original dispatch consumed, and requests a distinct assignment through the existing replacement
claim flow and remaining attempt budget. The control performs no native send; the next **Design scenarios with local
Codex** request uses a new assignment, attempt and lease against the same accepted inputs. Ambiguous cleanup,
canonical submission, provider evidence or an exhausted authorization refuses this path.

The current canonical Designer reader exposes environment IDs, approved routes and frozen resource descriptors
(IDs, kinds and hashes). It does not expose the selected environment address, credential/username presence or
locator display names. The app-owned prompt passes the complete reader result; it does not query additional catalog
or credential rows to fill these gaps. An unavailable field in this assignment does not establish that server
configuration is missing. Existing published portfolios are immutable and are not rewritten by prompt changes.

`APP_SERVER_LOCAL_V1` Journeys can use the Scenario Designer and Automator through the repository-only
attempt-scoped worker MCP. Appraise issues the work, the current coordinator claims and admits it through the
versioned services, and the trusted gateway seals a grant for that exact project, Journey, role, assignment
generation, attempt, lease, input, scope, and tool profile. The grant expires with the lease. Claim and admission
check the role's readiness before spending or admitting an attempt. Worker reads leave coordinator ownership
versions unchanged.

- The Designer reads the approved charter, completed Scout and Resource Explorer bundles, frozen scope, and
  Appraise-issued portfolio lineage. On a revision assignment it also receives the exact predecessor and feedback.
  Its submission proposes a portfolio through specialized Scenario acceptance. Appraise verifies the Discovery
  revision, provenance, and assignment and records the candidate. The coordinator publishes that exact candidate
  to the existing Scenario Portfolio review. Appraise records the human's decisions against the reviewed version.
- The Automator reads the exact approved scenario revisions and decisions, plus the compatible frozen destination,
  Step Definitions, operations, and locator references. Appraise retains locator values. The worker proposes step
  mappings through specialized Automation acceptance. Appraise validates the mappings and derives the output
  references from the suite, case, and prepared capsule in the materialization transaction.

Each profile exposes only the role's scoped read and submission. Both exclude human decisions, execution consent,
general repository or catalog writes, and dispatch. The staged E2 invalidation fence still applies. A prepared
capsule is available for the separate execution-consent flow. Materialization itself creates no consent, TestRun,
or executable RuntimeCapsule.

The deterministic verification uses a fresh migrated SQLite fixture with M08 Discovery, in-memory scoped worker MCP,
and a separate disposable browser review fixture. Public managed opt-in, real provider and runtime qualification,
and live protected access remain open. The M06 STOP and spent attempts retain their original status.

The managed Automator resolves locator-typed parameters against the frozen locator choices before canonical submission. The projection preserves the selected locator and rejects duplicate or out-of-scope references. An eligible retained proposal can use the same projection during recovery.

#### Interrupted local preparation

After an Automator lease expires, Appraise can offer a reviewed replacement plan when the original native send has an unknown outcome and has no accepted submission or materialization. Recovery records the failure and dispatch timestamps, fences the old assignment, and binds a successor to the same authorization, approved scenarios, and budget. This successor only compiles and submits the reviewed operations. The old native process retains its recorded unknown outcome and its dispatch fence. Refreshing the journey reopens the issued recovery.

A compound scenario step can map to several ordered operations. The compiler checks that the operations cover every source step in order. An admitted manual successor can also reference a reviewed supplemental selector with a reason. The frozen Discovery inventory stays intact. Test execution still requires separate approval of the prepared run and environment.

For newly prepared Discovery bundles, selecting a ready built-in step definition also freezes its exact operation dependency. Both definitions must match the frozen hashes and compatible handler. For historical bundles missing those explicit operation references, a reviewed recovery can reconstruct only the matching dependencies of the approved steps from the original frozen inventory.
