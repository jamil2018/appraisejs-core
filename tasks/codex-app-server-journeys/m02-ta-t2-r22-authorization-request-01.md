# R22 exact future runtime authorization request 01

**PROPOSED, NOT APPROVED, NOT RUN.** Current authority permits offline work only. This is one concrete future request; no actual R22 decision receipt exists and no runtime root has been created. Never retry or resume R21 or any consumed command.

The confirmed offline defect is corrected and the exact source/artifact review accepted one conditional future invocation. Actual R21 exception attribution and cleanup remain UNKNOWN. M02 is incomplete: actual T2 completed cases 0; T3 incomplete; GC3 REVISE / not passed. Frozen M00 SHA-256 remains 1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133. No real inference budget remains (3/3 consumed).

## Exact artifacts

- Proposal: tasks/codex-app-server-journeys/m02-ta-t2-recovery-07.md, SHA-256 532b5cde6d9a7e9ad6287d46022b13729f8c88ce37856d752768ee383975f5b2.
- Manifest: .appraisejs/m02-ta-matrix-build-r22/manifest.json, SHA-256 a35aef1ffe9e5dda2c9108195d7f01e6b879df6f4ea963d3355772d2ce69ddd6, digest 38a6bd1c2552275068b8a5e09c9a89d8567dafdd989e26da9368018a008ae0b4, 6,628 artifact claims.
- Canonical bundle: .appraisejs/m02-ta-matrix-build-r22/canonical-bridge.mjs, SHA-256 b3c620aec79545d6166ff00c0ce9c0b52cf5ba5fa700f605216f57fae071bc55.
- Combined independent exact review: .appraisejs/m02-t2-r22-exact-review.json, SHA-256 6f23c548f947d8cbf79899d02a7fea309aff3472f7307806fc2d40550bb1220b.
- Non-authority decision template: .appraisejs/m02-r22-proposed-decision-template-01.json, SHA-256 6eb01cd06a6876ab6f64892c67df32fcb4cad1b495ffab2f9ae95deb353f5b8c. Its envelope cannot satisfy the decision gate. The projected exact actual receipt hash is daa0334683a47fdb797a351b7a3e47e9af042e454b521e32b92e7d9d8209c187; creating that fixed receipt requires the separate visible approval below.
- Offline evidence: .appraisejs/m02-r22-offline-checks-01.json and .appraisejs/m02-r22-preservation-01.json. 65/65 tests passed, including real composed red/green and all 24 scripted cases; ESLint/Prettier passed. Production serialization equals the fixed prepared bytes. Reviewed synthetic precheck and a projected-decision input check passed with imported programPath/readDecision test seams, not a real host invocation or actual decision.

## Fresh paths, command and host context

Future runtime root: /private/tmp/appraise-m02-ta-matrix-p8 (absent). Future actual decision: .appraisejs/m02-t2-r22-recovery-user-decision.json (absent). Build-r22 is already prepared; never rerun --prepare. Keep p7 and all historical roots, UNKNOWN outcomes, pending effects and cleanup records intact. Do not reuse old roots.

After the exact visible approval, create the actual receipt exclusively from the template and rehash it. Permit exactly one read-only precheck, followed only on success by exactly one full 24-case invocation. For both commands use workdir /Users/jamil/Personal Projects/appraisejs and requested host tool mode exec_command sandbox_permissions=require_escalated; no reusable broad prefix. This request does not attest effective host mode.

Read-only precheck (not run):

```sh
'/usr/bin/env' '-i' 'PATH=/usr/bin:/bin' 'LANG=C' '/opt/homebrew/Cellar/node/26.11.0/bin/node' '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22/entrypoint.mjs' '--precheck' '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r22/manifest.json' '38a6bd1c2552275068b8a5e09c9a89d8567dafdd989e26da9368018a008ae0b4' 'a35aef1ffe9e5dda2c9108195d7f01e6b879df6f4ea963d3355772d2ce69ddd6' '6f23c548f947d8cbf79899d02a7fea309aff3472f7307806fc2d40550bb1220b' 'daa0334683a47fdb797a351b7a3e47e9af042e454b521e32b92e7d9d8209c187'
```

One runtime invocation, only after that precheck succeeds (not run):

```sh
'/usr/bin/env' '-i' 'PATH=/usr/bin:/bin' 'LANG=C' '/opt/homebrew/Cellar/node/26.11.0/bin/node' '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22/entrypoint.mjs' '--run' '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r22/manifest.json' '38a6bd1c2552275068b8a5e09c9a89d8567dafdd989e26da9368018a008ae0b4' 'a35aef1ffe9e5dda2c9108195d7f01e6b879df6f4ea963d3355772d2ce69ddd6' '6f23c548f947d8cbf79899d02a7fea309aff3472f7307806fc2d40550bb1220b' 'daa0334683a47fdb797a351b7a3e47e9af042e454b521e32b92e7d9d8209c187'
```

## Allocations and stop conditions

| Counter           | New campaign ceiling |       Cumulative ceiling |
| ----------------- | -------------------: | -----------------------: |
| cases             |                   24 | not a cumulative counter |
| codexStarts       |                   24 |                       29 |
| mcpStarts         |                   24 |                       29 |
| threadStarts      |                   24 |                       29 |
| turnStarts        |                   23 |                       28 |
| providerRequests  |                   58 |                       66 |
| scopedCalls       |                   34 |                       34 |
| outerCalls        |                   35 |                       39 |
| listenerStarts    |                   24 |                       32 |
| controlWrites     |                   96 |                      115 |
| canonicalRequests |                  184 |                      194 |
| sourceCapacity    |                   58 |                       82 |

Cumulative workspaceActions 2 and permissionReplies 1 remain historical policy ceilings, not new T3/workspace or grant authority. This T2 invocation permits zero workspace actions and zero permission grants; B14 sends one correlated empty denial. Combined listener ceiling including R16 is 33. Preserve R21's consumed listener allocation 1 and source capacity 4; capacity is a source reservation, not an observed OS process count. Earlier failed T1 and R15/R16/R19 standalone allocations remain separately recorded in the unchanged budget.

Bound the campaign to the frozen 24-case order, one local scripted run only, 60 seconds per case and 2,400 seconds total. No real provider/auth/account access, real inference, Appraise grants, privileged tracing, commits, push or T3. Native addon/process/listener effects are authorized only if this future request receives its separate approval.

Stop on any precheck refusal, artifact/witness/current-file/tuple/root/receipt drift, missing ACK, deadline, foreign protocol action, ambiguity, budget breach, startup failure, incomplete case witness, failed owned exit/close/host-absence witness or uncertain cleanup. Preserve UNKNOWN, pending reservations and fresh-root evidence; no retry, resume, replacement campaign, success cleanup or automatic T3. Best-effort owned stop is limited to handles from this invocation; never signal a stored PID or remove historical roots. Actual evidence must be reviewed separately before any T2 qualification.

Offline tests do not establish native protocol emission, actual canonical SDK/SQLite behavior, socket/addon/process-image compatibility, OS lifetime or actual cleanup. No M02 completion, containment, M03 admission, production dispatch or release follows from this request.

## Exact decision requested

To authorize only the bounded precheck and one campaign above, reply:

> Approve one fixed R22 T2 p8 campaign bound to manifest 38a6bd1c2552275068b8a5e09c9a89d8567dafdd989e26da9368018a008ae0b4 and exact review 6f23c548f947d8cbf79899d02a7fea309aff3472f7307806fc2d40550bb1220b, including one read-only precheck. No retry, resume, automatic successor or T3.
