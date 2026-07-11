# Validation AST And Delegated Authorization Contracts

The version 1 Validation AST is the canonical agent-authored description of validation intent. It binds execution to
versioned action and locator references while retaining descriptions for human review. The public schemas are exported
from `src/lib/validation-ast`.

An AST contains an ID, title, purpose, covered plan tasks, browser/environment matrix, scenarios, ordered semantic
steps, and quality concerns. Step inputs may be primitives or exact locator, environment, stored-output, and custom
extension references. Raw executable source is not accepted in a step. Project-specific TypeScript is submitted only
through a versioned `CustomActionExtensionProposal`, including the capability gap, typed inputs/outputs, and required
capabilities.

The contracts define shapes only. Reference resolution, compatibility checking, preview hashes, compilation, review,
and publication belong to later compiler phases.

The installable `appraisejs` package exports version-aligned TypeScript contracts from
`appraisejs/phase1-contracts`. MCP clients discover active contract versions through the four
`appraise://contracts/*` resources without receiving an unbounded catalog or graph dump.

## Delegated authorization

A coordinator may issue a narrowly scoped HMAC-SHA256 receipt to a context-isolated worker. Claims bind:

- permitted action class (`validation-ast` or `custom-extension`);
- immutable target fingerprint;
- exact brief or plan hash;
- issuer, expiry, and nonce;
- maximum permitted phase (`check`, `preview`, or `publish`).

Authorization verifies the signature with timing-safe comparison, exact target and plan identity, action scope, phase
ceiling, expiry, and one-time nonce consumption. The caller owns durable nonce storage and must atomically consume the
nonce before accepting the delegated mutation. Receipts do not replace Appraise-owned validation review or approval.
Appraise persists consumed nonces with a unique primary key and expiry metadata so replay protection survives process
restart.

`delegated_validation_ast_submit`, `POST /api/internal/coordinator/delegated/validation-ast-submissions`, and
`appraisejs validation submit-delegated-ast` provide the bounded worker handoff. They validate the V1 envelope, verify
the exact receipt scope, target fingerprint, plan hash, check-phase ceiling, expiry and signature, then atomically
consume the nonce and store the submission. The result is `accepted-for-check`; it does not resolve references,
compile, preview, publish, or mutate validation entities.

Secrets and unsigned claims must never be logged or persisted as authorization evidence. Production issuers should
use a secret from protected local configuration and short expirations.
