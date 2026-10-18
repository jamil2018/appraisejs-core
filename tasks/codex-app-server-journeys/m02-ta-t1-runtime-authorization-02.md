# M02-TA T1 exact runtime authorization request 02

Date: 2026-10-16 (Asia/Dhaka). Status: exact offline candidate; **not launched**. Independent review and its byte binding are recorded separately. This request is for T1 only. M02 has not passed.

## Exact artifact

Runtime manifest digest: `b9616423339cf298352e578f0fb04c192a343d633f34c8201c2bf3d7a6dac973`.

Manifest file SHA-256: `d7cfc700f9b1edcefe40bd8ae1b1968edee74ebd9c5a554a5d2e5435e2a47afb`.

Private manifest: `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-t1-build-r3/manifest.json` (0600, owned 0700 parent). It pins **5,802 files**: the runtime source, accepted T0 dependencies, package dist and SDK dependency tree, Prisma client/engine, Zod, current checked-in fixture migrations, interpreter, environment launcher and Codex executable. Hashes are re-enumerated and compared before effects; absent/extra/changed inventory blocks execution. The full manifest remains local because it includes machine paths and generated dependency identities. Revisions r1 and r2 are historical, never launched or runtime-authorized, and remain untouched. R2 was held REVISE after discovering a generated-client environment loader; this request supersedes it.

| Primary artifact      | SHA-256                                                            |
| --------------------- | ------------------------------------------------------------------ |
| codex                 | `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28` |
| canonical-backend     | `b98095b7da860b88928d1f2f16f4abebe2f2da01eff04b29a4b2aee7890e6809` |
| root-package          | `e72dc3831d874e96d346ea1054d93472440decf8512f13e66b0e412da44f3cf4` |
| descriptor-collector  | `fd9e1d8e6b9f1e48e823dc2d3bccb355cadc69176b61c5e2998e3cbc8d541f9f` |
| supervisor            | `c50ceb00269498c87df48713e9ed74feda9587a49013367f138f1c9440155952` |
| scoped-mcp-entry      | `41698a68283b012579ee418f932024c837faa699917bad5641abbb0519e9da00` |
| policy                | `359c83e2aaa52817a2aab05b14754ebf1e34ced0d930782304851c06e15e3013` |
| schema                | `46258b190ece052a825fe8de26f00f95ea20004ec9c61eb5c1d8a31a27faf41f` |
| interpreter           | `02dc8fa00d7f857c2412a5d55a85a1b7a341e94c3df430bd8733c732e31dca46` |
| environment-launcher  | `2b2a1145527f00e8369fda0d2ffc523b520201bb08dbaf4b0bded837f7652ce0` |
| root package metadata | `e72dc3831d874e96d346ea1054d93472440decf8512f13e66b0e412da44f3cf4` |

The schema artifact above is the retained M01 pin record; the stable schema manifest it records remains `a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c`. These are different hashes for different artifacts. Pinned host tuple: macOS 27.0.1 / build 26A434 / arm64, Node v26.11.0. Read-only checks matched; the run rechecks identity and refuses drift.

## Exact command and permissions

Working directory: `/Users/jamil/Personal Projects/appraisejs`.

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-runtime/t1-runner.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-t1-build-r3/manifest.json' b9616423339cf298352e578f0fb04c192a343d633f34c8201c2bf3d7a6dac973
```

Authorize **one invocation only**, including the exact command's narrowly requested host sandbox exception if required for owned loopback bind/connect and pinned child stdio/process control. Request that exact command's exception before starting it; do not first run an unapproved socket test or retry a partially attempted command under different permissions. No reusable generic shell/network permission or permission grant to Codex is requested. Automatic approval rejection, tool-result ambiguity or an existing phase root stops execution and is reported; never resend an ambiguous start.

`/usr/bin/env -i` exec-replaces the supervisor process image; it is not an additional helper child. It supplies only `PATH=/usr/bin:/bin` and `LANG=C` before Node starts, so there is no inherited Node preload or account environment. The supervisor then sets `NODE_ENV=production` and the explicit synthetic database URL before loading the staged canonical backend. The backend is never imported from its original repository location by this command. No real `.env`, project database or credential values are task inputs. This claim depends on the staged dependency path below, not on DATABASE_URL or environment clearing alone. The supervisor's repository access is read-only pinned executable/dependency/migration inputs. The migration SQL is applied only inside the fresh disposable SQLite database, in process; no migration CLI or production schema change runs.

The native child receives only fresh HOME, CODEX_HOME and TMPDIR, uses the disposable workspace as cwd, and runs the pinned `codex app-server` with private stdin/stdout/stderr pipes. Its thread config fixes `gpt-6.1-sol`, reasoning `medium`, approval policy `never`, operational sandbox `workspace-write`, the required scoped MCP child and local scripted provider with retry maxima zero and `requires_openai_auth:false`. This is trusted-agent operational configuration, not an OS containment or credential-isolation proof. The MCP child is the pinned Node interpreter plus the pinned T1 entry, with its exact private bootstrap path; no shell/npx/tsx/runtime compiler/helper is invoked.

The supervisor owns one OS-assigned port bound to `127.0.0.1`. The same listener serves `/v1/responses` and `/m02/canonical`; the assigned port and bootstrap binding are recorded. There are no redirects, external provider, auth headers, DNS destinations or external services in the script. Scripted provider handling captures descriptor contracts and returns HTTP 503 without a model or tool response. Canonical IPC performs only bootstrap and exact profile binding (two requests), with synthetic fixture state; it grants no real project permission.

## Staged supervisor dependencies

After exclusive journal/root creation and before module import, the supervisor stages byte-identical pinned copies of the accepted canonical bundle and `node_modules/@prisma/client`, `node_modules/.prisma/client` and root `node_modules/zod` beneath `/private/tmp/appraise-m02-ta-descriptors-p1/supervisor/modules`. These are reviewed runtime code/dependencies in the private supervisor tree, not project source or model context supplied to the native workspace. About 115 MB is copied; each selected file must match its source pin, and output files/directories must be private, owned, regular and nonsymlink. There is no installer, compiler, new process or network request.

The compiled bundle's relative `require('../../package.json')` requires one additional byte-identical pinned copy of the public repository `package.json` at `/private/tmp/appraise-m02-ta-descriptors-p1/package.json`. This is code-version metadata only; its scripts are never invoked.

Both the staged bundle's ESM import and its CommonJS require must resolve Prisma and its runtime inside that owned module tree. The copied generated client's relative environment path resolves to `/private/tmp/appraise-m02-ta-descriptors-p1/supervisor/modules/.env`, which must be absent. Any resolution mismatch, symlink, changed identity/hash, existing or unreadably indeterminate synthetic environment path stops before importing the backend. No copied generated code or accepted T0 artifact is patched. The full original pinned runtime source inventory is rechecked before native effects; the staging receipt records the copied count, digest, staged bundle path and resolution-check classification. Individual Prisma/Zod paths are checked before import but are not serialized in that receipt.

A fresh offline guard test imports the exact staged backend, constructs a lazy bridge and executes a synthetic SQLite SELECT through staged Prisma, with zero `.env` content-read attempts and zero repository `.env` existence checks. This checks the known JavaScript dependency path; it is not OS filesystem attestation. The full fixed-root canonical workspace remains unobserved until T1. Lazy AJV JIT paths unresolved in the original bundle are not silently supplied from repository modules; an unexpected dependency path stops UNKNOWN.

## Exact limits and stop behavior

- One supervisor, one Codex child, one scoped MCP child and one listener; no extra helper or probe child.
- At most one new thread, one turn and one local provider request. Zero inference, model/tool responses, tool actions, grants, resumes, replacements or retries. M01's exhausted 3/3 budget is untouched.
- One active case; 60-second case budget, 180-second T1 phase ceiling. Dispatch reserves part of the case budget for bounded cleanup. No four-minute or other silent timeout extension.
- Only fresh `/private/tmp/appraise-m02-ta-descriptors-p1`, with phase supervisor/journal/modules, pinned package metadata and `cases/T1/{home,codex,workspace,tmp,supervisor}`, owned 0700 directories and 0600 files. The other T2/T3 roots remain absent. Any pre-existing root, symlink, changed inode/owner/mode or failed exclusive creation stops; no adoption, deletion/recreation or reset.
- Durable intents precede effects. Unexpected frame/request, wrong identity/profile, incomplete capture, extra provider/IPC request, permission/auth/network requirement, missing shutdown receipt, deadline or uncertain cleanup fences UNKNOWN. Owned cleanup uses SIGTERM and owned listener closure, including bounded partial-start fallback; no PID-based signals, SIGKILL, fallback executable or new attempt.

The T1 error adapter recognizes at most one same-thread/turn, nonretryable HTTP 503 error **after** successful capture, followed by the unchanged peer's failed-turn handling. ID-bearing requests, unknown fields, different status/shape, duplicates, retrying or pre-capture errors fence UNKNOWN. Current [official documentation](https://learn.chatgpt.com/docs/app-server) describes the error-before-failed-terminal sequence; the candidate field shape was also checked against upstream `ErrorNotification.ts` on main, not the pinned binary's generated schema. The exact pinned runtime variant remains **unqualified**. A different variant is a stop, not a reason to amend the parser during the run or resend the start.

## Evidence and retention

Retain full bounded descriptor containers/contracts, callable hashes and correlation IDs; no raw request prompts, transcripts, reasoning, credential/account values or provider response bodies enter the sanitized evidence. Keep exact journal intents/acks, profile binding, conservative retention clock, startup and exit receipts, owned Codex exit/close and listener close observations. The child exit receipt is **trusted self-report**, not OS attestation. No marker or parent exit alone proves MCP containment or canonical role behavior.

The new journal fixes a conservative earliest possible provider-history intent timestamp before any native effect. Its seven-day unresolved retention decision deadline survives reopening unchanged. Successful reconciliation records the separate 24-hour deadline to delete only this attempt's provider-local history. The current M02 coordinator is the deadline owner. The cleanup scope is only this run's fresh `/private/tmp/appraise-m02-ta-descriptors-p1/cases/T1/codex` provider-local history. After independent terminal/ownership review, the coordinator must prepare a bounded owned-path cleanup, obtain the required scoped authority and retain a durable cleanup receipt by the recorded `historyDeleteDueAt`. T1 approval does not itself authorize deletion. No raw-history deletion is claimed by preparation or by the launch command. Missing eventual cleanup is an operational obligation, not a completed check. UNKNOWN history remains fenced and requires a scoped retention/recovery decision at seven days. Existing canonical/history/approvals/consents/interruption/sealed evidence is never deleted or rewritten. The fixed runtime root and durable receipts are not automatically removed to permit retry.

## Gate after T1

Stop after descriptor capture and owned cleanup, then independently review the actual evidence and native mapping. **T2, T3 and M02-C+ are not launched by this command.** T2/T3 need actual captured descriptor/SDK profile/codec correlation and their own concrete reviewed runnable commands. Changed mapping code or budgets requires revised exact review and authorization, as the approved plan requires. Real provider/auth/model behavior, production support and M03+ remain unqualified.

Copy-ready approval:

> Approve the T1 runtime invocation for manifest `b9616423339cf298352e578f0fb04c192a343d633f34c8201c2bf3d7a6dac973` exactly as specified in M02-TA T1 runtime authorization request 02. Allow the narrowly scoped host exception needed by that exact command for owned loopback and pinned child control. One attempt only; preserve history and stop UNKNOWN without retry on ambiguity. No auth, inference, grants, T2/T3, M02-C+, commits or push.
