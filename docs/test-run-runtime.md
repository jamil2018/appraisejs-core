# TestRun Runtime

TestRuns are the managed execution records used by Assessments. An Assessment run prepares an immutable runtime capsule from a published Validation Version, evaluation-subject revision, and target-project identity, then starts the corresponding TestRun.

Runtime capsules are content-addressed and materialized under the target-owned runtime root. Their manifests capture frozen validation inputs, operation identities, locator/resource resolution, environment selection, and generated artifacts. A materializer uses bounded ownership tokens so concurrent callers cannot mutate the same capsule.

Before a Quality-owned TestRun is prepared, AppraiseJS projects the immutable published validation artifacts into the target-scoped relational execution index. This projection is idempotent and must complete before TestRun-to-case/suite links are inserted, so managed execution never relies on fabricated foreign-key identities.

TestRun output includes report, log, trace, and runtime diagnostics artifacts. Assessment reconciliation verifies those artifacts against the capsule identity and seals one immutable Evidence Receipt for every completed assessment matrix cell. TestRun success by itself is not an assurance decision; the assessment evidence matrix and requirement alignment remain authoritative.

Stopping an Assessment stops only executions it owns. Already sealed receipts remain available, while late process completion cannot overwrite an Assessment that has been stopped. Standalone evidence execution follows the same integrity rules but cannot issue an Assessment decision.

Runtime code must preserve the shared Step Definition, locator, target-project, Cucumber, Playwright, report, and TestRun infrastructure. Canonical operation definitions own browser behavior; generated projections and runtime wrappers are regenerated from those definitions.

Authored flow nodes may supply an optional Gherkin presentation label. That label controls only the human-readable scenario and Cucumber log text; the exact Step Definition ID, version, definition hash, and typed inputs remain the execution identity. When no label is supplied, AppraiseJS continues to derive presentation text from the canonical Step Definition signature and inputs.

Managed binding generation emits one static registration line per unique reviewed phrase. Cucumber progress output therefore points at a distinct generated registration instead of reporting every managed step against one shared loop line; repeated equivalent phrases remain registered once, and conflicting duplicate phrases still fail closed.

When a browser operation fails, the runtime also captures a bounded set of visible native validation messages and alert text from the current page. These diagnostics are appended to the stable operation error rather than requiring a trace or screenshot to discover an immediately visible field-level rejection.
