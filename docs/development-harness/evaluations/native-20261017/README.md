# Native harness pilot, 2026-10-17

This packet contains sanitized aggregate evidence for 48 native CLI cases at frozen commit `ac758ceaa12330f969b166e6be1d18f7b3dc98c9`.

The raw aggregate SHA-256 is `71d42be5c8a5f0e5e94c4c5f555eb5598b0a9b65f6c08179422c802f58ce9b9a`; raw JSONL, stderr, final answers, patches, and disposable checkouts remain outside this directory. Each case in results.json has hashes for its raw files.

The historical runner froze its own source, manifest, and guidance, but not imported harness-pilot helper source. Complete executable dependency identity is therefore unavailable.

Numeric JSONL telemetry was reparsed using `parseCodexJsonlLine` from `scripts/run-native-harness-pilot.mjs` at SHA-256 `0b330580e5839fcda90f918c6463518cb0d25fd41ae2bcaef17aa0ff29144d2e`. This parser identity is distinct from the frozen runner identity.

Outcomes: 46 complete, 1 failed, 1 incomplete. Both comparisons are **unknown/unqualified** pending effective-host execution proof and complete verdicts and telemetry.

- `manifest.json`: frozen task and arm definitions.
- `freeze.json`: frozen input hashes and requested arms.
- `runner-frozen.txt`: historical source of the exact runner used; not executable from this packet.
- `results.json`: sanitized case measurements, null unknowns, and raw-file hashes.
- `report.json`: evaluator output and all received operational costs.
- `descriptive-pairs.json`: same-task/repetition token and elapsed deltas for completed pairs only; descriptive and unqualified.

No API-price estimate or subscription-cost claim is made.
