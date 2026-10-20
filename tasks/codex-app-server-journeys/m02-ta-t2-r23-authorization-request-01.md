# R23 exact future runtime authorization request 01

**PROPOSED, NOT APPROVED, NOT RUN.** TA05 authorized offline R23 only. The earlier exact R22 approval stopped on root-package drift before its actual precheck or campaign; it consumed zero native allocations and cannot authorize R23. Never retry/resume R21 or another consumed command.

The additive R23 qualifier accepts only the approved exact five-script metadata transition and current root-package hash, with separate old Git-source evidence. It retains the R22 archive correction, exact 23 TA04 witnesses, current-file hashes, tuple checks and fail-closed gates. Independent exact review found no material issues. This is eligible for requesting the bounded runtime observation below; native compatibility is unqualified.

## Exact artifacts

- Approved offline TA05: `tasks/codex-app-server-journeys/m02-ta05-root-package-requalification-01.md`, SHA-256 a57a8b3bbd5b0eb95345b121d5268092508245d73dfb57d8661dc69e74bb75f7. Its actual approval record is `.appraisejs/m02-ta05-user-decision-01.json`; it grants no runtime authority.
- R23 proposal: `/Users/jamil/Personal Projects/appraisejs/tasks/codex-app-server-journeys/m02-ta-t2-recovery-08.md`, SHA-256 65132627fc0b995d2ecbd9dd579f58b3b6627c55882d8adec892d2be4b810980.
- Manifest: `.appraisejs/m02-ta-matrix-build-r23/manifest.json`, SHA-256 d80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93, digest 1186bde2afd29a05191dce61b9386e2e28f6d76e088f52ae8158ed7d13b396f2; 6,674 claims = 6,651 current files + 23 historical archive-backed claims.
- Canonical bundle: `.appraisejs/m02-ta-matrix-build-r23/canonical-bridge.mjs`, SHA-256 6ec0cf424eb5799454ca17182572ab557575675b3bef366de030ad4b86339fdd.
- Independent exact review: `.appraisejs/m02-t2-r23-exact-review.json`, SHA-256 6b202df65af0f9449440141a583f5b8818acf8acbb28fdecfb9b82e3f9209709, verdict ACCEPT_ONE_FIXED_T2_R23_INVOCATION, runtime NOT_RUN.
- Non-authority decision template: `.appraisejs/m02-r23-proposed-decision-template-01.json`, SHA-256 8df7b03949539984634bb4119adada6808e322683f3417306bd2ce0dcf5705e2. Projected exact actual receipt SHA-256 9c99667a959f7dd05e9b12a61a36253d342203bf0c54ffddc542634059863d60. The template cannot satisfy the actual fixed decision-file gate.
- Checks: `.appraisejs/m02-r23-offline-checks-01.json`, retained TAP, fixed serialization record, preservation record and reviewed-input checks. 71/71 tests passed, including all 24 real composed offline cases, continuation/refusal/missing-ACK/deadline/cleanup paths and 17 serialized receipt refusal variants. ESLint and Prettier passed. Production serialization equals fixed prepared bytes. The reviewed synthetic specimen and projected actual-receipt input passed imported test seams under external-effect guards; these are not the actual host precheck, runtime authority or native evidence.

## Fresh paths and exact commands

Future root: `/private/tmp/appraise-m02-ta-matrix-p9`, absent. Future actual decision: `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-t2-r23-recovery-user-decision.json`, absent. Preserve absent p8 (R22 never launched), retained p7 UNKNOWN, historical roots, pending reservations and unresolved cleanup. Fixed build-r23 already exists; never rerun `--prepare`.

After separate exact visible approval, record its literal reply exclusively at `.appraisejs/m02-r23-visible-approval-01.json`, then exclusively serialize the template's expectedActualReceipt to the actual decision path and rehash it. That receipt normalizes the approved scope; its visibleUserDecision field is an explicit enum, not a purported quotation. Changed bindings or bytes stop execution.

Permit exactly one read-only precheck and, only if it passes, exactly one new full T2 campaign. Both use workdir `/Users/jamil/Personal Projects/appraisejs`, requested tool mode `exec_command sandbox_permissions=require_escalated`, without a reusable prefix. This requests a host execution mode; it does not attest its effective enforcement.

Actual read-only precheck, not run:

```sh
'/usr/bin/env' '-i' 'PATH=/usr/bin:/bin' 'LANG=C' '/opt/homebrew/Cellar/node/26.11.0/bin/node' '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23/entrypoint.mjs' '--precheck' '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r23/manifest.json' '1186bde2afd29a05191dce61b9386e2e28f6d76e088f52ae8158ed7d13b396f2' 'd80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93' '6b202df65af0f9449440141a583f5b8818acf8acbb28fdecfb9b82e3f9209709' '9c99667a959f7dd05e9b12a61a36253d342203bf0c54ffddc542634059863d60'
```

One actual runtime invocation, only after successful precheck, not run:

```sh
'/usr/bin/env' '-i' 'PATH=/usr/bin:/bin' 'LANG=C' '/opt/homebrew/Cellar/node/26.11.0/bin/node' '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r23/entrypoint.mjs' '--run' '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r23/manifest.json' '1186bde2afd29a05191dce61b9386e2e28f6d76e088f52ae8158ed7d13b396f2' 'd80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93' '6b202df65af0f9449440141a583f5b8818acf8acbb28fdecfb9b82e3f9209709' '9c99667a959f7dd05e9b12a61a36253d342203bf0c54ffddc542634059863d60'
```

## Allocations and stop conditions

| Counter           | New campaign ceiling | Cumulative ceiling |
| ----------------- | -------------------: | -----------------: |
| cases             |                   24 |     not cumulative |
| codexStarts       |                   24 |                 29 |
| mcpStarts         |                   24 |                 29 |
| threadStarts      |                   24 |                 29 |
| turnStarts        |                   23 |                 28 |
| providerRequests  |                   58 |                 66 |
| scopedCalls       |                   34 |                 34 |
| outerCalls        |                   35 |                 39 |
| listenerStarts    |                   24 |                 32 |
| controlWrites     |                   96 |                115 |
| canonicalRequests |                  184 |                194 |
| sourceCapacity    |                   58 |                 82 |

Cumulative workspaceActions 2 and permissionReplies 1 remain historical policy ceilings. This T2 campaign permits zero workspace actions and zero permission grants; B14 permits one correlated empty denial only. Combined listener ceiling including R16 remains 33. Preserve R21's consumed listener 1/source capacity 4 and every earlier failed T1/R15/R16/R19 allocation. R22 and offline R23 added zero native allocations. Source capacity is a source reservation, not an observed OS process count. The finite scripts issued 54 simulated provider requests in the offline green campaign, within the ceiling 58.

Use the fixed 24-case order, 60 seconds per case and 2,400 seconds total. This permits the bounded local scripted native/addon/process/listener effects only after this exact request is separately approved. No real provider/account/auth access or inference, Appraise grant, privileged tracing, commit, push, T3 or automatic successor.

Stop on precheck refusal, current-file/archive/witness/tuple/root/receipt drift, missing ACK, deadline, foreign protocol action, ambiguity, budget breach, startup failure, incomplete case witness, failed owned exit/close/host-absence witness or uncertain cleanup. Preserve UNKNOWN, pending allocations and fresh-root evidence. No retry, resume, replacement campaign or success cleanup. Best-effort owned stop may use only handles from this invocation; never signal a stored PID or remove historical roots. Review actual evidence separately before any T2 qualification.

## Remaining status and exact decision

Actual R21 precise failure path/effects/cleanup remain UNKNOWN. Actual T2 completed cases remain **0**, T3/M02 incomplete, GC3 **REVISE / not passed**, inference exhausted **3/3**. Frozen M00 SHA-256 remains 1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133. Native protocol emission, actual SDK/SQLite behavior, process image/addon/socket compatibility, OS lifetime and cleanup remain untested. No containment, M03 admission, production dispatch, completion or release follows from this request.

To authorize only the commands and bounds above, approve this exact R23 request:

> Approve one fixed R23 T2 p9 campaign bound to manifest 1186bde2afd29a05191dce61b9386e2e28f6d76e088f52ae8158ed7d13b396f2 and exact review 6b202df65af0f9449440141a583f5b8818acf8acbb28fdecfb9b82e3f9209709, including one read-only precheck. No retry, resume, automatic successor or T3.
