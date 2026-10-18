# T2 R12 one-shot runtime record 03

2026-10-16. **NOT RUN; explicit recovery decision pending at creation.** Preserve p1 UNKNOWN and all consumed prior commands. This is a distinct, source-backed p2 candidate, not replay/resume of R11 B01.

- Recovery proposal SHA `31fc52c32913197df112ab14cd9eb7ed6e811b5ceed384432ee953a6965bf218`.
- Source review `.appraisejs/m02-ta-matrix-r12-source-review-01.json`, SHA `1e4044a34f75f5b30f305165dce3135e4992fabe7294cc34004e40076250ab23`.
- Exact command review `.appraisejs/m02-t2-r12-exact-review.json`, SHA `2bfd4b956e3b0f0a3e4d6c2fd4d89e720dae8d28bd5192023d1376fff403e8d4`.
- Manifest `.appraisejs/m02-ta-matrix-build-r12/manifest.json`, SHA `7bb8aca0af7f5818be18cb56235b3bd1f4841259380feeb3183c41393244795d`, digest `b491149d39635d1592092b1df76d4bbe0fe5f8a53a8337e1809cb75a21c2b48f`, 6,371 pins.
- p2 canonical bundle SHA `56406b531245aeab4dff145a8641d231fe747e19dcadcd8b7df1af9df933e173`.

Fixed new root `/private/tmp/appraise-m02-ta-matrix-p2`; absent at review. Existing p1 root, valid UNKNOWN journal, archive and actual failure review stay immutable. Proposed cumulative listener/control/source-capacity limits are 28/109/66 as described in the proposal, distinct from actual observed process counts. All native operation/turn/provider/scoped/workspace/denial and no-auth/no-real-inference/no-grant limits remain.

The exact reviewed command prefix is stored in the exact review. It takes the fixed R12 entrypoint, manifest path/digest/file SHA, then that review's SHA and finally the SHA of an exclusive `.appraisejs/m02-t2-r12-recovery-user-decision.json`. That decision record may be created only after the actual user approves both exact artifacts. No placeholder, missing file or test-port boolean grants authority. Its provenance is host-conversation transcription, not a cryptographic signature.

After submission, consume the one command. Any uncertainty stops without another campaign; record actual results and safe evidence without changing earlier UNKNOWN. No T3 runtime follows until actual T2 acceptance and separate exact T3 review.

## User decision and submission intent

The user explicitly selected “Approve this one reviewed R12 recovery” for proposal SHA `31fc52c32913197df112ab14cd9eb7ed6e811b5ceed384432ee953a6965bf218` and exact review SHA `2bfd4b956e3b0f0a3e4d6c2fd4d89e720dae8d28bd5192023d1376fff403e8d4`. The exclusive fsynced decision record has SHA `82e18cbf29b8b50797e5a4c08d003419f745d3df77695eab1f26138a5d3b917b` and explicitly transcribes that visible decision without claiming a host signature.

Exact approved one-shot command:

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r12/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r12/manifest.json' b491149d39635d1592092b1df76d4bbe0fe5f8a53a8337e1809cb75a21c2b48f 7bb8aca0af7f5818be18cb56235b3bd1f4841259380feeb3183c41393244795d 2bfd4b956e3b0f0a3e4d6c2fd4d89e720dae8d28bd5192023d1376fff403e8d4 82e18cbf29b8b50797e5a4c08d003419f745d3df77695eab1f26138a5d3b917b
```

At this appended intent it is about to be submitted once; retain the returned host observations as evidence. The user did not authorize another automatic campaign after this one.

## Observed result — UNKNOWN, consumed

Submitted once: exec session `80963`, initial chunk `64ae72`, terminal chunk `5e1ccb`, exit 1. B01 reached one recorded Codex/MCP start, thread, turn, local provider request and outer call, with three control writes and two canonical startup requests. Scoped/audit/workspace/permission counts remained zero. No case completed. The p2 root device/inode `16777230/68891739` remains retained with its valid 29-record journal; no pending reservation remains, but the outcome is UNKNOWN and owned cleanup is not qualified by a persisted exit/close/host-absence witness. Owned-stop recovery records do not prove full process absence.

The sanitized failure receipt records `UNKNOWN_REQUEST_OR_NOTIFICATION`, phase `turn`, sequence 26, notification method SHA `39402612ae798040809cafb764eaabf5900680e335e9f7f83e79b9a7b9b51c18`. A source-only lookup in the pinned 318-file schemas maps that hash to `account/rateLimits/updated`. Actual params were not retained and remain UNKNOWN; no account payload was read for diagnosis. The first provider response had passed the exact captured descriptor gate. No second provider request or scoped MCP dispatch occurred.

Safe archive `.appraisejs/m02-ta-t2-r12-execution-evidence-01/index.json`, SHA `b306ce22c1061a35c9c24144e5683e3d08be774cdb78c22661dfc55b2f640cb4`: seven allowlisted copied files, 260 ENOENT entries; raw state and both failed roots remain unchanged. Visible-host-output transcription `.appraisejs/m02-t2-r12-execution-result-01.json`, SHA `33f52351c8d2b0cbb0c1b66a4028582006f51a0745bf6a87b847960bf3319c60`, is not authenticated OS inventory. Independent actual failure review is required; this result does not satisfy T3's predecessor gate.

The installed schema classifies the method as passive server notification, not an auth request. Open Design's ignored/unmapped-notification handling and t3code's schema-decoded notification dispatch are relevant source references; their account-read probes are not authorized for M02. Any additive classify-and-discard mapping must be reviewed without retaining account data or deriving auth/eligibility/spend claims. This consumed command must never be resent. No subsequent campaign is authorized automatically.

## Independent actual review

Review `.appraisejs/m02-t2-r12-execution-review-01.json`, SHA `a3668b1538f2dbbefa66d50cfbf41c639b87b42ca0830317365e6618b09412cc`, returns `ACCEPT_ACTUAL_R12_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION`. It checked all 267 archive entries/current source identities and the valid journal, with no case finish or terminal success checkpoint. This accepts the failure evidence, not runtime conformance or cleanup. The one approved R12 campaign is consumed.
