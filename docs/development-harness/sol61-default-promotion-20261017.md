# Sol 6.1 default promotion — 2026-10-17

## Decision and authority

After reviewing the completed-pair pilot results and its limitations, the user explicitly directed:
“if the overall tests favored 6.1 sol let's switch it.” This authorizes a manual default-policy promotion.
It supersedes the previous default hold for this change; it does not turn the pilot into qualifying evidence
or relax the normal automatic-promotion prohibition or future evaluation requirements.

The original pilot remains unqualified: 46 of 48 attempts completed, effective model and internal retries were
not attested, and the measurement environment had overlapping load. Completed-pair model results were 18.7%
fewer median total tokens and 19.0% lower median elapsed time. Preserve the original
[evaluation packet](evaluations/native-20261017/README.md) and [implementation report](native-improvements-20261017.md).

## Configuration

| Role              | Model       | Reasoning                                    |
| ----------------- | ----------- | -------------------------------------------- |
| Investigator      | GPT-6 Luna  | medium; high for extended evidence           |
| Executor          | GPT-6.1 Sol | medium; high for consequential extended work |
| Executor advanced | GPT-6.1 Sol | high                                         |
| Solver            | GPT-6.1 Sol | high; xhigh for extended cross-module work   |
| Judge             | GPT-6.1 Sol | high                                         |
| Exceptional judge | GPT-6 Astra | high                                         |

The default subagent model and six canonical Sol registrations move together with the selection policy and
registered-variant map. Explicit `*-sol61` aliases remain for existing clients. Context isolation, sandbox,
external-write authority, fail-closed selection, and empty fallback lists are unchanged. The model-currency
report recognizes 6.1 as a default rather than an unpromoted candidate.

The current host advertises executor, executor-advanced, solver, and judge registrations as GPT-6.1 Sol at
the preserved efforts following the configuration update. Host advertisements are distinct from per-run
execution attestation. Other sessions must load matching registrations before delegation; a stale GPT-6 Sol
registration is rejected, never silently substituted. This does not set or identify the parent chat model.

## Verification and rollback

Focused tests cover the new defaults, unchanged effort and Luna/Astra selections, historical Sol receipts,
stale-host rejection, and model-currency output. Required harness/configuration checks and independent
exact-artifact review apply before shipping. The prior journal and pilot artifacts are not rewritten.

Rollback reference: `ef15ff484091b0b052fcedf4d9047c33471384b2`. Revert the promotion commit as a separate
reviewed change to restore its coupled policy, registrations, variant mappings, currency reporting, and tests;
retain this decision and the original evaluation history. Do not overwrite unrelated working changes.
