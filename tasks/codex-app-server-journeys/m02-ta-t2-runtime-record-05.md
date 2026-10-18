# R17 T2 actual record — 2026-10-17

**UNKNOWN, zero cases completed. M02 remains incomplete.** The user approved one reviewed R17 recovery. Its exact command ran once, stopped in B01 and fenced. The authority is consumed. No replay, resume, retry, replacement campaign, T3 or cleanup of this UNKNOWN root is authorized.

## Approval and exact invocation

The visible user reply was “Approve this one reviewed R17 T2 recovery”, responding to question item `["request_user_input_async","call_099940701413469b86141fe7a28552c4",0]`.

- [Recovery proposal03](m02-ta-t2-recovery-03.md), SHA `c3d17fb95be5c151200d072013449fc24e838ab809bd85386d43132fcd50269e`.
- Exact review `.appraisejs/m02-t2-r17-exact-review.json`, SHA `06390562c5392a15a5b3ea40e75c494d3ae1b154f7f41790712f07ad4d0296d2`.
- Manifest digest `f66dcb2379ef2deb4f9e4076b13a31d0e7377a80de49ecf0873b18a716e8d871`; file SHA `1152b718d331be89c4c2c49227effd8d9435a2b4062dc01f24e33006ec854124`.
- Exclusive decision receipt `.appraisejs/m02-t2-r17-recovery-user-decision.json`, SHA `5342de8f6cf0d0430d7baeafb3947428af40b75e48fae6f1e188601408c6741d`, transcribes host conversation rather than a cryptographic signature.

Pre-submission chunk 4fe72d rechecked five exact pins and p4/decision absence before creating the actual decision receipt. The fixed reviewed command used the pinned Node executable with `env -i`, its exact entrypoint/manifest/digest/file-SHA/review-SHA/decision-SHA arguments, repository workdir, and explicit `sandbox_permissions=require_escalated`. No reusable broad prefix approval was supplied. The requested mode is visible; effective host enforcement remains UNATTESTED.

Tool session **98138**, initial chunk **a83653**, intermediate chunks **dfd381 / 94d876**, terminal chunk **2755b7**, exit **1**. No command was resent.

## Actual retained observations

The final CLI result is `UNKNOWN`, failed case `B01`, completed `0`, reason `AMBIGUOUS_EFFECT`. Root `/private/tmp/appraise-m02-ta-matrix-p4` has device/inode `16777230/69032559`. Thirty journal records end at hash `29735e88459636415866b241acdbb0e5bbe02ddcc7a462a7a533d48cad733c7a`; journal file SHA `219c30ab437b5f7d98617f0ad54ff4f7bad0784fad1a8292cbc541aa9a3ebb4e`.

| Recorded allocation                                                          | Count |
| ---------------------------------------------------------------------------- | ----: |
| Codex / MCP / thread / turn, each                                            |     1 |
| Listener                                                                     |     1 |
| Local provider-request reservations                                          |     2 |
| Control writes                                                               |     3 |
| Canonical requests                                                           |     2 |
| Outer issuances                                                              |     1 |
| Scoped calls / audit requests / workspace actions / permission replies, each |     0 |
| B01 source-capacity reservations                                             |     4 |

The second local provider request, `B01-listener-request-2`, remains pending without acknowledgement. Do not report both reservations as completed requests/responses. Source capacity is not an independently observed OS process count. The first scripted response receipt exists and binds its descriptor/plan hashes; the second response receipt and protocol-failure receipt are absent. The actual second request body and immediate exception were not retained and remain UNKNOWN.

The journal contains `owned-stop-intent` and `owned-stop-observed` recovery labels. Those labels alone do not qualify full cleanup, native-host absence, every child exit or listener close. The MCP exit receipt is separate evidence; its precise meaning must remain distinct from complete owned cleanup. No stale-PID signal, process scan, successful-history deletion or second campaign followed.

## Safe archive and review

Safe archive `.appraisejs/m02-ta-t2-r17-execution-evidence-01/index.json`, SHA `941adadd5cd685e9b0a0b6594d13721db8a83dfac25477e41f071bad7c38265b`, records exactly 267 allowlisted expected paths: six copied and 261 missing. Copied files are the phase journal, module-stage receipt, B01 MCP startup/exit, script plan and first provider-response receipt. Copying used stable no-follow/private-owner/file-identity checks, exclusive 0600 files, fsync and byte equality with the retained source. Source evidence was not changed. No raw provider body, native history, account/auth payload, credential or production database was collected.

Visible tool-output transcription `.appraisejs/m02-t2-r17-execution-result-01.json`, SHA `563bdfbbd81fab254df49f4b15e35c0dea9725d1b77918d585b5d04341406c29`, records the actual consumed session, terminal result and counters. It is process evidence, not an authenticated host or syscall receipt. Independent actual review is recorded separately after checking these final bindings; this document grants no runtime authority.

## Limits and remaining work

R17 reached a native thread/turn and first scripted response, unlike R13's pre-native stop. This does not qualify a role operation, establish the request2 failure cause, validate containment or attest effective host mode. No actual T2 case passed, and T3's accepted-success predecessor gate is unsatisfied.

Preserve M00, accepted M02-A/B0/B1/T0/T1 and R13–R17 source/build/reviews, p1/p2/p3 matrix UNKNOWN, p1 preflight UNKNOWN, accepted R16 observation and all earlier historical UNKNOWN. GC3 remains REVISE / not passed; real-inference budget remains 3/3. No auth, real inference, Appraise grant, privileged tracing, commit, push, schema/UI/release or M03+ work follows from this run.

Any later correction must first have a bounded evidence-backed offline proposal and exact review. A new runtime allocation/root/command requires a new actual decision; the consumed R17 approval grants no automatic replacement.
