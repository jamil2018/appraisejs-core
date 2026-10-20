# Exact request: one fresh R26 p12 B01 diagnostic invocation

Approval requested for exactly the command and fixed artifacts below, once only. This is a diagnostic experiment to expose the unknown completion/cleanup condition after R25 committed a valid synthetic acceptance. It does not establish a working M02 solution or authorize a full T2 campaign, continuation, successor or T3. No new tests were written or run.

The original user instruction requires separate exact authorization for each fresh native invocation. R24 and R25 approvals are consumed. Continuing implementation is authorized; this request is the final exact gate for the fresh native effect. Nothing in this document, the prospective receipt or offline preparation grants native authority.

Command, from `/Users/jamil/Personal Projects/appraisejs`, using `exec_command sandbox_permissions=require_escalated`, no reusable approval prefix:

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r26/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r26-02/manifest.json' 5de31358eb1484312136bc917966f63ef2cad117be3170a19ffef9a7de181fcc bacf83d01f826a63ebba62aaaeeb8c7a8ac0b4fa258bcfb8ae83842f9032107c 3e7f2959b8dc6072f499dba325ea9a26c07041667f5b889029bc9cf3132011e4 4061c35fa7e9c2658d728cef5ae078b6d00782182b0967aa80607ddaa912cb14
```

Exact artifacts:

| Artifact                                                                                                                           | SHA-256                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r26-02/manifest.json`                                   | `bacf83d01f826a63ebba62aaaeeb8c7a8ac0b4fa258bcfb8ae83842f9032107c` |
| Manifest digest                                                                                                                    | `5de31358eb1484312136bc917966f63ef2cad117be3170a19ffef9a7de181fcc` |
| `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r26-02/canonical-bridge.mjs`                            | `c9fe61692664b2c7f11a884bc283071a65d2d4f056b22ce4713a93a41e7de5c8` |
| `/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r26/entrypoint.mjs`               | `64ecb215f27ea6235d88be0ff532fb3062155d23144dca6fe40a30d71c87ac43` |
| `/Users/jamil/Personal Projects/appraisejs/tasks/codex-app-server-journeys/m02-r26-b01-diagnostic-proposal-02.md`                  | `6897dffd7df043e13208a6f8a633173c5ea8c2252c32bcce70eee187bd31a1c7` |
| `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-r26-focused-review-02.json`                                             | `7f74c10dd266ad71e45936a6ca9f54830db448a9a4221e0c28e7003928e9e379` |
| `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-t2-r26-exact-review.json`                                               | `3e7f2959b8dc6072f499dba325ea9a26c07041667f5b889029bc9cf3132011e4` |
| `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-r26-prospective-user-decision-01.json` (non-authorizing wrapper)        | `ee71ad9b590508f0b67165f7e07b539a179600bba380114f4bb2a0ac3e2edddb` |
| Prospective actual receipt bytes at `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-t2-r26-recovery-user-decision.json` | `4061c35fa7e9c2658d728cef5ae078b6d00782182b0967aa80607ddaa912cb14` |

The actual receipt remains absent. After literal exact approval only, materialize the wrapper's wouldMaterialize object with the same two-space JSON serialization and final newline, exclusively at that fixed path with mode0600; verify its exact hash, record the literal approval, and submit the exact command once. Do not execute the withdrawn first build or regenerate fixed preparation. The first build's original bytes remain retained; its review required moving optional diagnostic IO after the original UNKNOWN fence, owned stop and canonical close. Revision02 implements that ordering and was re-reviewed only for changed bytes and affected assumptions.

Fresh paths: native root `/private/tmp/appraise-m02-ta-matrix-p12` (must remain absent until the command creates it), preparation `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r26-02`, retained terminal/evidence paths `.appraisejs/m02-r26-native-terminal-01.json` and `.appraisejs/m02-r26-native-terminal-evidence-01/`. The optional sanitized failure receipt is `/private/tmp/appraise-m02-ta-matrix-p12/cases/B01/supervisor/late-case-failure.json`. It retains only closed stage/reason categories, seven gate states and an allowlisted code; no raw exception, provider/account/auth data, history or database rows.

Only B01 can run. Upper bounds: listener1, Codex1, MCP1, thread1, turn1, provider requests4, scoped calls3, canonical requests14, outer calls3, audit requests6, control writes4, source capacity4, helper starts0, workspace actions0, permission replies0. Preserve existing 60000ms case deadline and bounded owned-close/observer checks. These are ceilings; the expected successful script uses provider3, scoped2, outer2 and audit4. A successful probe stops immediately with B01_PROBE_COMPLETED_NOT_FULL_T2, runtimeQualified false and fullT2Qualified false; no remaining case can be started.

Consumed allocations remain unchanged:

| Run | listener/Codex/MCP/thread/turn each | provider | scoped | control | canonical | outer | source | Pending / cleanup           |
| --- | ----------------------------------- | -------- | ------ | ------- | --------- | ----- | ------ | --------------------------- |
| R23 | 1                                   | 2        | 0      | 3       | 2         | 1     | 4      | provider request2 / UNKNOWN |
| R24 | 1                                   | 2        | 0      | 3       | 2         | 1     | 4      | provider request2 / UNKNOWN |
| R25 | 1                                   | 3        | 2      | 3       | 8         | 2     | 4      | empty / UNKNOWN             |

Retain historical whole-campaign ceilings without treating them as unused authority. Conservative cumulative retained ceilings including R25's consumed delta: Codex32, MCP32, thread32, turn31, provider73, scoped36, workspace2, permission1, listener35, control124, outer43, canonical206, source94; combined listener36 including R16. Only the B01 bounds above may be consumed by this invocation. All earlier pending reservations, consumed commands and UNKNOWN outcomes remain preserved; no reset or refund.

Stop at the first refusal, missing/invalid ACK, correlation or tuple mismatch, current-hash/TA04/TA05 drift, deadline/quota breach, unexpected process, ambiguous effect or cleanup uncertainty. Fence UNKNOWN and attempt only the existing owned-stop path; do not signal historical PIDs, replay, retry, resume, repair historical roots or launch a successor. Missing optional diagnostics never establish success or authorize another attempt. A terminal tool exit or MCP exit0 does not prove full cleanup.

No account authentication, real inference, production Appraise grants, privileged tracing, historical cleanup, commit or push. Real inference remains exhausted3/3; GC3 remains REVISE/not passed. Frozen M00 SHA256 remains 1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133. TA04 exact23 witnesses, TA05 qualification, current hashes, strict tuple/correlation and fail-closed rules remain unchanged.

Evidence before this request: real fixed preparation serialization and verification passed,6835 claims (6812current+23 exactarchive), guarded imports of29 runtime modules attempted zero external effects; ESLint/Prettier passed. No native precheck or actual native behavior was exercised. Tests added/run0; R26 native invocations0. T2, T3 and M02 remain incomplete.
