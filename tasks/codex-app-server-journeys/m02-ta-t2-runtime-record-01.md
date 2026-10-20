# T2 R10 one-shot runtime record 01

2026-10-16. Native execution intent under the user's explicit full-M02 continuation authorization. Source review `.appraisejs/m02-ta-matrix-r10-source-review-01.json` SHA `173770ef2ee3dde16e39a49f451deec2020519de6a81a9a488a9581bcc5ad731`; exact prepared-manifest/command review `.appraisejs/m02-t2-r10-exact-review.json` SHA `160652eccb92ed0591a53c8704f1462c8c90d61dae309020820ad9a4685573fc`.

Manifest `.appraisejs/m02-ta-matrix-build-r10/manifest.json` SHA `603d50d5b9afb3fb051d293e88fef87dfb68ef621dc0daac5b97e7a9ba4f7a7a`, digest `69f6c17a7d1e0fddb3d2662b0ab6c5aaf1e125f38daca6b454e3cb3432235120`, 6,337 pins. Fixed disposable root `/private/tmp/appraise-m02-ta-matrix-p1`. One full 24-case invocation; no prefix/resume, correction turn, ambiguous resend or automatic replacement root.

Exact command:

```sh
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C /opt/homebrew/Cellar/node/26.11.0/bin/node '/Users/jamil/Personal Projects/appraisejs/scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r10/entrypoint.mjs' --run '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-ta-matrix-build-r10/manifest.json' 69f6c17a7d1e0fddb3d2662b0ab6c5aaf1e125f38daca6b454e3cb3432235120 603d50d5b9afb3fb051d293e88fef87dfb68ef621dc0daac5b97e7a9ba4f7a7a 160652eccb92ed0591a53c8704f1462c8c90d61dae309020820ad9a4685573fc
```

At intent creation, T2 is NOT RUN. Once the host command is submitted, treat it as consumed unless authoritative evidence proves no start. Preserve all results and UNKNOWN; do not resubmit after a timeout or ambiguous return. Synthetic loopback responses only, no real provider inference/auth/grants. T3 is separately blocked and is not part of this command. Actual outcome and exact execution review will be appended here after observation.

## Observed preflight result

The command above was submitted once. Tool chunk `858c17` returned exit 1 in 0.021364417 seconds, with `T2 entrypoint host invocation environment changed`. This exact error originates before prepared-artifact verification, addon load or runner invocation. A separate metadata-only fixed-env Node command (chunk `a54ea2`) reported exact expected executable/PATH/LANG, environment keys `LANG`, `PATH`, `__CF_USER_TEXT_ENCODING`, and fixed T2 root absent. No environment value or credential was retained.

Allowlisted transcription: `.appraisejs/m02-t2-r10-preflight-evidence-01.json`, explicitly not an authenticated host receipt. This preflight result is not a native case pass or UNKNOWN reconciliation for any earlier campaign. The old exact command remains consumed and must not be rerun. Any correction must be additive, independently reviewed and separately recorded; preserve R10 source/manifest/reviews byte-for-byte.
