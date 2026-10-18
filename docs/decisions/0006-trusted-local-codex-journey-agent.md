> Current shipping checkpoint: [M02 scripted qualification accepted](../../tasks/codex-app-server-journeys/M02-SHIPPED-SCRIPTED-QUALIFICATION-01.md). T2 R51 passed24/24 andT3 R55 passed2/2; final exact evidence review accepted within TA02/TA03 limits. `runtimeQualified` remains false; helper lifetime/global inventory and historical cleanup remain unobserved. No M03 or production dispatch authority follows. Older status passages below remain historical.

# ADR-0006: Trusted local Codex agent for Journey qualification

Date: 2026-10-15 (Asia/Dhaka).
Status: **user-selected direction; exact amendment and revised plan proposed for approval**.
No implementation or runtime authorization is supplied by this ADR.

## Context and authority

The user instructed:

> Let's follow Open Design’s trusted-agent model. Prepare the exact M00 amendment and revised M02 plan, preserving the frozen contract and historical evidence. Don’t launch anything yet.

This selects a different trust assumption from M00-r3's MCP-only worker. It authorizes preparing
these documents, not acceptance of unseen final bytes or execution. The additive
[M00 trust amendment 02](../../tasks/codex-app-server-journeys/m00-trust-amendment-02.md) is the exact
proposed contract change; the [M02 trusted-agent plan](../../tasks/codex-app-server-journeys/m02-trusted-agent-plan-01.md)
defines its qualification scope and next authorization boundary. Read these together as the newest
proposed decision record. Their status takes precedence over any summary calling the new contract approved.

The [recorded Open Design reference](../../tasks/codex-app-server-journeys/open-design-reference.md)
is pinned to `014bffbf775f4514020cef8bbffdc0eb5a0009ce`. Its recorded trusted CLI/workspace-write
posture motivates this choice. No fresh upstream audit, upstream test execution or guarantee about
all Open Design configurations is claimed. We are adopting the trust model, not every upstream default.

## Decision proposed for exact approval

Treat the local Codex engine and its native tool loop as a trusted agent acting for the local user
inside an explicitly approved task/workspace/configuration. Keep the scoped Appraise MCP gateway
as the intended application interface. It enforces its own schemas and authorization checks, but
it is not a security boundary against native access by that same trusted agent.

M02 will qualify scoped gateway behavior, supported actual native routing, disposable workspace
effects and failure handling. It will not qualify adversarial OS containment or claim that native
file/process/network access cannot bypass Appraise. A separate containment candidate, credential
broker or `sandbox-exec` policy is no longer required to meet that revised M02 scope.

Appraise's canonical artifacts, human decisions, external admissions, no-chat workflow, current
binding checks and future M03 mandatory sessions remain required application behavior. Trusting
the agent does not grant a task authority to approve, run tests, repair product code or alter real
state without the corresponding instruction/consent. Those are behavioral and service-level rules;
they are not an adversarial guarantee against same-user database/file access.

## Consequences and alternatives

This removes the prior engine/tool isolation feasibility gate and permits a reviewed native or
Code Mode route rather than requiring direct MCP descriptors exclusively. It does not make unknown
routes work: complete contracts, exact schemas/correlations, supported encoding and observable
canonical acceptance are still necessary. Existing strict mapper/fixtures retain their narrower
accepted meaning and bytes; any trusted-route implementation must be separate and versioned.

The local user accepts that a compromised or misbehaving trusted agent may use available native
access to read/change accessible data or bypass application workflows. Native sandbox settings,
explicit cwd/configuration and approval policies remain useful operational limits without a new
security claim. This model is unsuitable as proof for hostile agents, mutually distrusting tenants,
untrusted shared hosts or protected secrets accessible under the same effective privileges.

The rejected alternative for this slice is continuing M00-r3's adversarial MCP-only qualification.
Its prior failed, blocked and UNKNOWN evidence remains valid for its original scope. No test,
review or blocked gate is retroactively converted to passed. If stronger isolation is wanted later,
create a separate exact contract and independently qualify it.

## Preservation and rollout

[ADR-0005](0005-codex-app-server-journeys.md), M00-r3, auth amendment 01, task registers and all prior
review artifacts retain their bytes. This new ADR and its two linked documents are the additive
entrypoint for the proposed change. After exact approval, apply only the amendment's explicit
clause substitutions; all other original obligations remain. Until then the original approved
contract remains in force, and all runtime authority remains zero.

M00's frozen hash remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
GC3 remains REVISE / not passed; M01's 3/3 remains exhausted. M02 is incomplete. No existing Journey,
receipt, provider history, code, schema, UI, release or admission is migrated by this decision.
