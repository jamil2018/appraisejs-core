# R16 host preflight actual record — 2026-10-17

The user explicitly approved: “Approve this one reviewed R16 host preflight. Run it once, preserve all accepted artifacts and UNKNOWN evidence, and report the result.” The fixed command ran once. Its authority is consumed; no resend, retry, T2 or T3 follows automatically.

## Exact bindings

- [Proposal03](m02-host-execution-preflight-03.md), SHA `eb7d5be5d8c0a30b720e997d3a0c89f53f73ece4cee81780fc97d9569f8b8aa0`.
- Exact review `.appraisejs/m02-host-preflight-r16-exact-review.json`, SHA `c5101a25a4d71a236da783dd460f309bbb75f54f77feb002fdb2966a71094a48`.
- Prepared manifest digest `0855dc75c439ebf5b46b5b02479132b4ae88ec1951d456d8c5a9fdaf0f1d8c56`; file SHA `ae05bb826450d276cbb880d603179c9fc64f6e3a12c9870364db67e8b536793a`.
- Exclusive user-decision receipt `.appraisejs/m02-host-preflight-r16-user-decision.json`, SHA `748f37aa8059b2039a7b86834027dc609055c6eb36518eb91cb39f8b6439d009`. This transcribes host conversation; it is not a cryptographic user signature.

Pre-submission verification (chunk 0dd256) rechecked five exact artifact pins and the absence of the new runtime root/decision before recording the actual approval. The invocation used the exact reviewed prefix plus exact-review and decision SHAs, from the repository workdir, with the explicit host-tool request `sandbox_permissions=require_escalated`; no reusable broad prefix approval was supplied. Effective host enforcement remains UNATTESTED.

## Actual bounded result

Tool session **50732**, initial chunk **6259d8**, terminal chunk **7fb031**, exit **0**. The CLI returned `OBSERVED_PERMISSION_CHECK_ONLY`, eight directories created, one listener start at an ephemeral `127.0.0.1` port (51997), and `listenerCloseObserved: true`. The retained root is `/private/tmp/appraise-m02-ta-host-preflight-p2`, device/inode `16777230/68982623`.

The on-disk result deliberately remains `CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE`. It is not authoritative success by itself. The final CLI receipt reports completion after the final flush and within the shared logical deadline. The visible CLI transcription is process evidence, not an authenticated OS receipt. No independent host process/lifetime inventory or effective sandbox-mode attestation is claimed.

The root retains exactly the eight approved private directories and three named files: `listener-intent.json`, `result.json`, and `cases/B01/workspace/synthetic.txt`. Safe archival checked no-follow regular files, private ownership/modes, stable file identity and byte equality, exact synthetic marker bytes, and the complete allowlisted tree. It made no change to the runtime root. No cleanup is authorized or performed.

Safe archive `.appraisejs/m02-host-preflight-r16-execution-evidence-01/index.json`, SHA `c980e1b457ef50a1f36297f79d4ec61fdf7990e9de4b66fcf6c5be2a793ecb9e`, contains three copied files and eight directory metadata records. Visible tool-output transcription `.appraisejs/m02-host-preflight-r16-execution-result-01.json`, SHA `1ea9063cfab713f13733c15e81fb5678369421ad1c92f090e88fff23fa4c04ae`, binds the consumed invocation/session and final CLI result. Both were created exclusively with private modes and fsync.

## Qualification limits

This observation establishes only that the reviewed command completed its named file/directory and loopback bind/close operations for this tuple and invocation. It does not establish the earlier EPERM cause, general future host permissions, hostile-agent containment, native child-launch support, auth/provider eligibility, real-model behavior, T2 or M02 qualification. The supervisor continues to report `runtimeQualified: false` and `t2Authorized: false`.

The reviewed command has no child/Codex/MCP launch, HTTP/provider request, auth, real inference, Appraise grant or privileged tracing path. No T2/T3, commit, push, merge, UI/schema/release work was performed. Accepted source, M00, GC3 REVISE / not passed, real-inference budget 3/3, retained p1 preflight UNKNOWN and all historical matrix UNKNOWN remain unchanged. Future T2 requires its own coherent fresh-root artifacts, updated allocation accounting, independent exact review and actual authorization.

Independent actual-evidence review `.appraisejs/m02-host-preflight-r16-execution-review-01.json`, SHA `9d21bac065f17090783356fd996773c2ac96ea1798461d7bd96401dcfaacc236`, accepts only `OBSERVED_PERMISSION_CHECK_ONLY`. It independently verified exact bindings/source pins, the three byte-equal archived files, eight owned private directories, root identity, all 3,349 preservation-baseline files/full modes, frozen M00 and intact p1 UNKNOWN. It retains the candidate-disk/final-CLI distinction and all qualification limits above. This readable record grants no authority.
