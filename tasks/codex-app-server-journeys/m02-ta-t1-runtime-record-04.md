# M02-TA T1 replacement runtime record 04

Date: 2026-10-16 (Asia/Dhaka). This is the exact R5 execution specification under the user's continuing full-M02 approval, clarified by “didn't the goal say I permit the actions. why stop?” It requests no repeated chat approval. Execution still requires independent exact-artifact review and the command's narrow host sandbox exception. At record creation, no R5 native invocation has occurred; M02 remains incomplete.

This additive record replaces request 03's obsolete command for future execution only. Request 03, r3/r4 source/manifests/reviews, M00, M01 and all historical evidence remain unchanged. Read [runtime state recovery](m02-runtime-state-recovery-01.md) for the changed executable, lost original root and hash-matched archival journal.

## Exact artifact and command

R5 preparation produced **6,154 exact artifact pins**, zero blockers, manifest digest `d50d6e7d3fd6f672e6c55b54e8b3473b8f5d32750daba6b597017dd07561111d`. Its exact serialized manifest is at `.appraisejs/m02-ta-t1-build-r5/manifest.json`, SHA-256 `02ab0bd9e744a892508e9f0927aee983a5a16ca2df3bef9efd9cc88ffe74dad0`. The once-only offline `--prepare` exited 0 and created that owned 0600 file in a new 0700 directory before final review; no runtime root or native launch was part of preparation. Inventory and file hashes are re-enumerated before effects; any mismatch stops.

| Artifact                    | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| R5 supervisor               | `b16983b23ddda9f553ae2b4d77d6fc533d015411b49f816a1452ad4265805059` |
| R5 prior-proof verifier     | `ffada45d4290c2a64284a1a938bb475ad873b899fece21d4de75a631b6b03a4c` |
| R5 policy                   | `91719603e373b7eb061e3d21151b47707eeaec17d2d058c8f1dea2ca81445620` |
| R5 schema pin               | `eadf6a761d55efcc17bd86178cf5ff192f113e425e4cfa129111a8dbf4251d7c` |
| R5 503 adapter              | `dba13d90348ec2135d17d72407a51d41b1c2dd78d1213d4e3495a2a3f1298a58` |
| R5 offline tests            | `4d4f3359c21bcad15e4e542d7c4dc6fc6930a8883576cd0762a477b0d250fb2a` |
| Reused p2 canonical backend | `e21b79aa2be776562572499501574e8550513d316c0821c399a7f005d2499b75` |
| Current Codex executable    | `1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe` |
| Pinned Node interpreter     | `02dc8fa00d7f857c2412a5d55a85a1b7a341e94c3df430bd8733c732e31dca46` |

Working directory: `/Users/jamil/Personal Projects/appraisejs`.

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5/t1-runner.mjs' --run-replacement '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-t1-build-r5/manifest.json' d50d6e7d3fd6f672e6c55b54e8b3473b8f5d32750daba6b597017dd07561111d
```

Invoke once with the specific host exception for owned loopback bind/connect and pinned child stdio/process control, requested before the first invocation. No reusable prefix permission, preliminary socket probe, alternate executable/permission mode or ambiguous resend. Polling the same returned exec session observes that invocation; it does not authorize another start.

## Effects and limits

The host tuple is macOS build 26A434 / arm64, Node v26.11.0 and `codex-cli 0.163.0-alpha.10.2` at the retained application path. The new version/schema provenance is explicit; no M01 qualification is transferred to it. Local R5 policy/composition/launcher/native-ports/protocol enforce the same T0 model `gpt-6.1-sol`, medium reasoning, approval `never`, workspace-write operational sandbox, required scoped MCP child and local scripted provider with zero retries and `requires_openai_auth:false`. These are trusted-agent operational settings, not proof of containment or credential isolation.

Only fresh `/private/tmp/appraise-m02-ta-descriptors-p2` is created. The prior p1 root must return lstat ENOENT. P2 uses an exists check followed by exclusive nonrecursive mkdir and owned identity checks before native effects; existing objects, symlinks, dangling symlinks and access errors cannot be adopted. This is an exclusive-creation gate, not an observed p2 lstat ENOENT requirement. T2/T3 roots remain uncreated. Directories are owned 0700 and files 0600. The supervisor stages pinned modules outside the repository, uses a disposable synthetic SQLite fixture and does not copy ambient home/config/auth/plugins/skills/MCP settings, `.env` or the user's database. Source/dependency/migration reads and the OS build plist are explicit inputs. Imports and offline `--prepare` perform no native launch, socket or provider operation.

One supervisor may start one pinned Codex child, one required scoped MCP child and one listener bound to OS-assigned `127.0.0.1`. The listener exposes only scripted `/v1/responses` and canonical `/m02/canonical` routes. At most one thread, one turn, one local scripted provider request and two canonical startup IPC requests (`bootstrap`, `bindProfile`) are allowed. Descriptor capture returns HTTP 503 and supplies zero model/tool responses. There are zero inference calls, tool calls, grants, retries, resumes or helper/compiler/probe children. The case ceiling is 60 seconds and phase ceiling 180 seconds with bounded cleanup reserve. No external provider, DNS destination, redirect or real authorization value is requested. The historical native inference budget remains exhausted at 3/3.

The narrow error adapter accepts only one nonretryable post-durable-capture 503 for the exact actual thread/turn, with a sole recognized variant (`httpConnectionFailed`, `responseStreamDisconnected` or the new schema's `responseStreamConnectionFailed`) containing only integer HTTP status 503. Completion also requires the actual failed terminal, reconciled durable intents and owned cleanup observations. All other errors, extra requests, unexpected permissions/auth/network, profile/schema/hash/root mismatch, missing acknowledgement, uncertain ownership/flush/cleanup or deadlines stop UNKNOWN. Signal only the observed owned child with reviewed SIGTERM and close the owned listener; never use stored PIDs, SIGKILL, root deletion or retry.

## Evidence and subsequent gates

P1 stays `UNKNOWN` / `LOST_RAW_ROOT_AFTER_REVIEW` with its original deadline `2026-10-22T18:54:08.422Z`. R5 pins the durable original execution/review/preservation records and independently reviewed 1,253-byte archival journal/provenance/review. The archive preserves historical bytes, not current original-root/inode proof or authenticated host non-dispatch. It cannot reset counters, extend retention or make r4's live-root preflight pass.

R5 offline tests cover all 318 generated schema pins, exact outgoing parameters, nested synthetic response/notification fixtures, strict negative 503 cases, local effect imports and real private-temp `runT1` preparation/capture-write failures. These prove bounded synthetic compatibility and fail-closed paths; the runtime peer does not enforce the complete generated schema on native traffic. Offline tests do not qualify actual native routing, containment or role access.

After execution, promptly archive only the sanitized journal, descriptor container, preparation/correlation and owned cleanup receipts into a new exclusive private durable evidence directory, preserving source identities/hashes and recording missing evidence. Do not archive raw prompts, reasoning, transcripts, provider bodies, account/credential values, bootstrap capabilities, fixture databases or Codex home. Do not delete UNKNOWN history. A successful reconciled outcome gets its separate 24-hour provider-history deletion deadline; the earlier unresolved seven-day decision remains independent. Any owned-history cleanup needs concrete independent path/terminal review and a durable receipt under the existing full-task authority.

Review the actual capture and route semantics independently before preparing exact T2/T3 runtime artifacts. Reusing one actual generic wrapper capture for six reviewed role mappings is permissible only when its actual schema/grammar supports those routes; direct Analyzer-only descriptors do not establish other roles. T2/T3 remain covered by full-M02 approval within the unchanged reviewed case/budget envelope, with their own exact preparation/review gates. An ambiguous consumed native start, unsupported mapping or materially changed effects/budget requires a scoped resolution; no automatic resend or fabricated capture. Auth, real inference, grants, M03+, UI/schema/release, commits, push, merge and publication remain excluded. M00's frozen hash is unchanged and GC3 remains REVISE / not passed.
