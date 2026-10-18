# M02-TA T1 replacement runtime authorization request 03

Date: 2026-10-16 (Asia/Dhaka). Status: offline-prepared replacement, not launched or runtime-authorized. Exact final review is recorded separately. M02 remains incomplete.

## Exact replacement artifact

Runtime manifest digest: `f43ee23fb2fc1f3c1c68be63b8ca11771f7b59c0d7885456df0f804b8bf284d5`.

Manifest file SHA-256: `a02dc1aeced93ff399e65c78a2bdd62170222a02a27021b7bbee5a2a0ee76278`.

Private manifest: `/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-t1-build-r4/manifest.json`, owned 0600 in a 0700 directory, **5,812 exact artifact pins**. Inventory and hashes are re-enumerated before effects. Source is additive under `scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r4/`; original T0/r3 source, build outputs, approvals and evidence remain unchanged.

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Replacement supervisor     | `a2fb2498bee8da8ba704c0341403031190759d6d961eb3ed3455ca335ffc0f5b` |
| Scoped MCP wrapper         | `5b24cf3215e769d5c51a197dee087320a2a32d50b1abcbc365a43456e1907772` |
| Scoped entry root variant  | `f211fef327656043137f4ea98718cb6e9dc1f8c3ca79f2fd2eee116a8a387a1a` |
| New canonical backend      | `e21b79aa2be776562572499501574e8550513d316c0821c399a7f005d2499b75` |
| Canonical build provenance | `4b892df7d74ec94c7a93e7c232ff6ea3f8fb3be0dbb81fa519cc7658bc1e9cb3` |
| Codex executable           | `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28` |
| Node interpreter           | `02dc8fa00d7f857c2412a5d55a85a1b7a341e94c3df430bd8733c732e31dca46` |

The new backend is the accepted compiled T0 backend with only its exact approved-root block changed to a single T1 p2 root. The compiler guards both accepted input source hashes. Independent static review normalized that block and recovered the entire original bundle's SHA-256. Build work is complete offline; no compiler or installer is invoked by the runtime command. The scoped entry copy changes only the descriptor-root literal from p1 to p2. This is an explicit proposed operational amendment, not authority inferred from the accepted policy's unchanged p1 root.

## Prior UNKNOWN and required exception

Request 02's one-shot invocation was consumed and ended UNKNOWN before native dispatch. Its manifest digest is `b9616423339cf298352e578f0fb04c192a343d633f34c8201c2bf3d7a6dac973`; its retained journal has file SHA-256 `00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff` and terminal hash `6ccd152391b72c8e1ce61800a66028d0d8b7ae8098815a8f258a9e6c78c3c5ef`. It contains only init and UNKNOWN, with no begin/start intent. Its source/layout supports a pre-dispatch failure; this is not OS-wide process attestation or a successful T1.

This request requires fresh explicit authority for **one replacement attempt despite the prior campaign stop**, using new root `/private/tmp/appraise-m02-ta-descriptors-p2`. It does not resend the original command, reuse p1, reset or remove its journal, erase the failed supervisor/staging attempt, or change its outcome. Replacement metadata binds the prior identities and retention deadline; preflight verifies the exact two-entry prior journal and its owned identities read-only. Drift or ambiguity stops before replacement effects. No previous native-start counter is credited as success.

## Exact command and permissions

Working directory: `/Users/jamil/Personal Projects/appraisejs`.

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r4/t1-runner.mjs' --run-replacement '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-t1-build-r4/manifest.json' f43ee23fb2fc1f3c1c68be63b8ca11771f7b59c0d7885456df0f804b8bf284d5
```

Authorize this command once, including only its narrowly scoped host sandbox exception for owned loopback bind/connect and pinned child stdio/process control. Request the exception before the first invocation; do not run a socket test or attempt a sandboxed launch first. No reusable shell/network prefix permission or permission grant to Codex is requested. Automatic approval rejection, ambiguous tool output, an existing p2 root or an incomplete start fences the attempt without resend, replacement executable or different permission mode.

Pinned host tuple remains macOS 27.0.1 / build 26A434 / arm64, Node v26.11.0. Codex path remains `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`. Native configuration fixes `gpt-6.1-sol`, medium reasoning, approval `never`, operational sandbox `workspace-write`, the required pinned scoped MCP child and local scripted provider with all retries zero and `requires_openai_auth:false`. Configuration is trusted-agent operational evidence, not a containment or credential-isolation claim.

The clean environment supplies only PATH/LANG before Node starts. The supervisor sets production mode and a synthetic database URL, privately stages pinned dependencies outside the repository, then imports the new backend from that staged tree. The native child receives fresh HOME/CODEX_HOME/TMPDIR and disposable workspace cwd. No ambient home/config/auth/plugins/MCP/skills are copied; no real `.env`, user database or credential values are inputs. Runtime source/data dependencies are pinned code/dependencies/migrations plus the exact retained prior journal proof. The supervisor also reads `/System/Library/CoreServices/SystemVersion.plist` for host identity and checks owned file/directory metadata. A pinned public package metadata copy is used for the compiled module's version resolution; its scripts are not invoked.

One OS-assigned listener bound to `127.0.0.1` serves only the scripted `/v1/responses` and canonical `/m02/canonical` routes. No external provider, DNS destination, redirect or real Authorization header is part of the script. Descriptor capture returns HTTP 503 with zero model/tool responses. The approved narrow correlated post-capture 503 classifier remains unchanged; a different actual pinned-runtime error variant is UNKNOWN, not grounds to alter the parser or resend.

## Limits and evidence

- One supervisor, one Codex child, one required scoped MCP child and one listener. No helper/compiler/probe child.
- At most one thread, one turn, one local scripted provider request and two canonical startup IPC requests (`bootstrap`, `bindProfile`). Zero inference, tool calls/responses, grants, retries, resumes or replacements within this attempt. M01's exhausted native inference budget remains 3/3.
- Case ceiling 60 seconds, phase ceiling 180 seconds, with bounded cleanup reserve. No silent timeout extension.
- Only fresh p2 root: owned 0700 directories and 0600 files, exclusive creation and inode/owner/mode checks. Phase supervisor holds journal/modules/preparation receipts; `cases/T1` holds disposable home/codex/workspace/tmp/supervisor. P1 remains read-only retained history. T2/T3 roots remain absent.
- Durable intents precede native effects. Wrong hash/root/profile/identity, auth/network/permission requirement, unsupported descriptor, extra request, missing acknowledgement, uncertain flush/ownership/cleanup or deadline stops UNKNOWN. Stop only owned handles with the reviewed SIGTERM/listener closure; never signal stored PIDs, use SIGKILL, delete/recreate a root or retry.

Retain full bounded descriptor containers, callable/schema/grammar hashes and correlation IDs, journal intents/acks, exact profile binding, preparation classification, module provenance, owned Codex exit/close and listener close observations, and capability/profile-bound scoped child startup/exit receipts. Do not retain raw prompts, reasoning, transcripts, provider bodies, credentials or account values in sanitized evidence. Child exit receipts remain trusted self-report, not OS attestation. Successful static checks and offline fixtures do not establish actual native routing or role behavior.

The preparation-order defect is covered by real disposable-filesystem tests through `runT1`. The guarded test-root canonical variant completes actual in-memory SDK bootstrap/profile binding and persists SQLite state with zero `.env` read attempts. These are **offline test-root observations**, not execution of exact p2 paths. The actual fixed-root/backend/native composition remains unqualified until this separately approved attempt.

## Retention and gate after T1

The retained p1 unresolved-retention decision is due **2026-10-22T18:54:08.422Z** and remains the coordinator's obligation. P2 gets its own conservative earliest-intent clock; it cannot supersede or reset p1's deadline. UNKNOWN history requires a scoped decision at seven days. A successful reconciled p2 terminal records a separate 24-hour provider-history deletion deadline. This command deletes neither raw history nor roots. After independent terminal/ownership review, any cleanup needs its own scoped authority and durable receipt. Existing Journeys/approvals/consents/interruptions/sealed/historical evidence are never removed or rewritten.

Stop after T1 descriptor capture and owned cleanup. Independently review actual descriptors, wrapper semantics, per-role offline SDK profiles and route correlations before preparing exact T2/T3 commands. One T1 capture may support six reviewed mappings only if an actually captured generic wrapper supports them; Analyzer-only direct descriptors cannot establish other roles. No T2/T3, M02-C+, real auth/inference/grants, M03+, UI/schema/release, commit, push, merge or publish is authorized by this request. GC3 remains REVISE / not passed. Full M02 remains incomplete until its remaining scripted matrix and final exact evidence review pass.

Copy-ready approval:

> Approve one fresh replacement T1 invocation for manifest `f43ee23fb2fc1f3c1c68be63b8ca11771f7b59c0d7885456df0f804b8bf284d5` exactly as request 03 specifies, explicitly permitting this new p2 attempt despite the prior campaign stop while preserving p1 UNKNOWN. Allow only the exact command's narrowly scoped host exception for owned loopback and pinned child control. One invocation, no retry on ambiguity; no auth, inference, grants, T2/T3, commits or push.
