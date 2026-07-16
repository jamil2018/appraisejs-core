# Release Readiness

`config/release-readiness.json` is the machine-readable ledger for repository release findings A-01 through A-13.
The ledger records the owner, current state, required evidence, and repository command that verifies each finding.

Run `npm run release:check` for the aggregate gate. The command validates the ledger, runs the named commands for
verified findings, and exits nonzero while a release-blocking finding is open or a verification command fails. It
orchestrates repository checks; it does not replace their lint, test, package, quality, or security implementations.

Allowed finding states are:

- `open`: the finding blocks release;
- `verified`: the named verification commands must pass;
- `waived`: temporary only, with `owner`, `rationale`, ISO `expiresOn`, and linked `review` metadata.

Release acceptance requires every finding to be `verified`. A waiver keeps the exception visible but is not accepted
as final release evidence for Appraise 0.5.

The generic planning contract is checked separately by `npm run release:check:generic-planning`: the connected coding
agent authors the project-specific graph, while Appraise validates schema, dependencies, scope, lifecycle, evidence,
and review binding. Production planning code must not infer tasks from domain keywords or ship fallback task graphs.
