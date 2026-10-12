# Phase 0 blocker investigation — 2026-09-10

This is an investigation and planning record, not a remediation completion receipt. Task status remains in
[the register](../TASK_REGISTER.md). Source inspected: `74cd7d1f14aa32ad3cf6eb3f5f67338776d95aa2` on
`codex/managed-quality-journey-coordinator-p0`; the worktree was clean before this documentation update.

## Findings

- **B0-001 remains open.** `scripts/qualify-managed-journey-provider.mjs` supplies `mcp_servers={}`, inherits
  `process.env`, does not configure the required Journey MCP and hardcodes `authoritativeNativeToolInventory: false`.
  Its disposable working directory is not isolated provider state. The recorded ambient-MCP result is evidence that
  this launch did not establish isolation, not proof that every possible Codex configuration is incapable of it.
- **B0-002 remains open.** The recovery suite tests conservative policy decisions; only its fake-process stdin-death
  fixture launches a process. It does not prove real App Server crash, lost-acknowledgement or resume behavior.
- **B0-003 is a reproduced checker defect.** The evaluator in
  `scripts/lib/managed-journey-provider-qualification.mjs` checks server names, receipt-key presence and a Boolean.
  It does not establish exact tool contents, readiness, semantic boundary values or trusted manifest provenance.
  The current launcher hardcodes false, so this is latent false qualification, not an observed production escape.
- **B0-004 records previously acknowledged missing proof.** P0.4's browser prototype does not demonstrate human
  login/MFA, owning-service/browser-process restart or hostile observations through a qualified Scout and real gateway
  with cross-Journey canaries. P0.R3b explicitly owns these omissions; Phase 3 retains production implementation.

## Reproduction

Run from the repository root; this starts no provider and uses no credentials:

```sh
node --input-type=module <<'JS'
import { evaluatePreTurnQualification } from './scripts/lib/managed-journey-provider-qualification.mjs'
console.log(evaluatePreTurnQualification({
  requiredMcpServer: 'appraise-quality-journey',
  mcpServers: [{ name: 'appraise-quality-journey', tools: {} }],
  threadStartResponse: {
    activePermissionProfile: null,
    instructionSources: null,
    runtimeWorkspaceRoots: null,
    sandbox: null,
  },
  sentMethods: [],
  authoritativeNativeToolInventory: true,
}))
JS
```

Observed: `qualified: true`, `mayStartTurn: true`, `findings: []`. Required after repair: reject with concrete
missing/invalid evidence findings. Do not make this pass by synthesizing provider evidence.

## Proposed course of action

1. P0.R0a fixes the checker and establishes a trustworthy acceptance contract with negative and synthetic positive tests.
2. P0.R0b establishes an isolated account-free launch with a synthetic required MCP; it cannot qualify native tools.
3. P0.R1 derives six scoped role registrations from the canonical MCP registry and keeps domain authority unchanged.
4. P0.R2 resolves the exact-provider feasibility question before broader implementation investment. A trusted manifest
   must correspond to actual request construction and dispatch; a separate preview or a signed self-claim is not enough.
5. P0.R3/P0.R4 exercise boundary and real protocol recovery against that artifact, with provider turns serialized.
6. P0.R3b completes browser feasibility evidence; P0.R5 independently reviews the combined artifact and all blockers.

If upstream cannot enforce and expose the required tool boundary, keep G0 blocked and present a bounded patch proposal
with maintenance and qualification costs. No compatibility patch, alternate provider, API-key fallback, weaker human
gate or production cutover is authorized by this document update. A successful investigation does not close a blocker.

## Evidence and limits

- Investigation reran `node --test scripts/tests/managed-journey-provider-qualification.test.mjs
scripts/tests/managed-journey-recovery-qualification.test.mjs`: 13 passed. Those tests did not cover the false pass.
- The standalone reproduction above returned the false pass. No repair has been implemented.
- Installed executable reported `codex-cli 0.153.4`; the investigation did not recertify its executable hash or launch
  boundaries. Historical executable/protocol hashes remain in P0.1/P0.2 and must be recaptured before qualification.
- Source inspection confirmed `packages/appraisejs/src/mcp/server-factory.ts` registers the full operation set through
  `mcp/registry.ts`, which captures canonical JSON schemas. It is reusable infrastructure, not a worker gateway yet.
- The repository Graphify query returned generic recovery nodes; direct source inspection supplied these findings.
- A bounded solver assessment, requested without inherited conversation, agreed on checker-first progression and the
  browser proof gap. This was advisory planning review, not exact-artifact provider/security acceptance. Effective host
  isolation was not independently attested.
- Official [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents MCP
  allowlists and individual tool toggles. [App Server documentation](https://learn.chatgpt.com/docs/app-server)
  documents resolved configuration reads. Neither cited control alone establishes the complete effective manifest
  required here. These sources were consulted during the investigation; no new upstream capability was qualified.

Documentation validation for this update: Prettier, `npm run docs:check-links`, `git diff --check` and a register
consistency check passed. The register has 40 unique tasks, 3 verified; every task has a specification and all task
dependencies resolve in execution order. These checks do not count as runtime qualification.
