# Native harness implementation and pilot — 2026-10-17

## Authority and scope

The user authorized this native-only implementation and commit/push to the existing branch. This work changes the
repository development harness, not Appraise-owned product lifecycle gates. M02 files, its historical evidence, and
unrelated working-tree changes are excluded. No external optimization package, proxy, plugin, or third-party trial
was added. Existing Fallow, Graphify, and Codex capabilities were used.

## Implemented behavior

- Logical profiles select exact named registrations. Fixed host profiles receive no model override. Every new spawn
  requests `fork_turns: "none"` and requires a bounded objective/evidence/constraints/acceptance packet. Unsupported
  registrations fail closed. Historical context and model receipts remain readable.
- GPT-6.1 Sol is available as an explicit evaluation candidate at the existing effort levels. GPT-6 Sol defaults,
  Luna investigation, and exceptional Astra review remain separately versioned. Model-currency reports compare dated,
  operator-supplied official evidence with catalog and host advertisements; reports cannot change defaults.
- Pre-commit executes the validation registry. Harness edits select harness checks; only recognized documentation-only
  changes skip code analysis. Actual-hook fixtures cover Git file states and preservation of diagnostics/nonzero exits.
- Fingerprinting scans relevant roots with content hashes and cache invalidation retained. The versioned benchmark
  measures traversal in the current worktree, independently of end-to-end agent productivity.
- Version 6 run records accept bounded aggregate host telemetry with per-field provenance. Missing token, cache,
  retry, model, and tool-output measurements remain null. Existing hash-chained journal contents are not rewritten.
- Native pilot tooling freezes eight repository tasks, two repetitions, a model-only arm and a guidance-only workflow
  arm, with timing that includes checkout setup. Reports retain failed/incomplete runs and baseline/candidate costs.

## Validation and review

Focused lint/format checks, 119 integrated harness tests, actual-hook fixtures, Fallow, and the pre-commit registry gate
passed. The six native-runner tests include interrupted process cleanup and incomplete telemetry. The production build initially failed
because the restricted shell could not fetch the existing Inter and Inter Tight Google Fonts dependencies; the
network-authorized build passed. TOML registrations are checked by the repository's TOML/harness validator; Prettier
has no TOML parser. The final exact-artifact independent acceptance receipt is retained locally with the shipping snapshot.

The initial independent review found and drove repairs for new context receipt validation, empty assignment packets,
and omitted baseline failure costs. The actual pre-commit gate also found introduced complexity and duplicate baseline
code; these were refactored without changing thresholds. A second review identified missing pilot process-group
cleanup on interruption; bounded teardown and tests were added. Further review repaired exact-path fingerprint traversal through symlink parents and partial tool-output reporting,
including malformed event lines. Regression tests cover each case. The source artifact was independently accepted
at digest `95bccf2e219cd838d81bba5f58c6d2ab6ef6d91cdd397fa9895cae03ae8494f8` before final evidence additions.
The initially launched pilot retains its frozen runner identity, and is not relabeled as execution of the later
cleanup and telemetry repairs.

## Pilot interpretation

The pilot runs in disposable checkouts at `ac758ceaa12330f969b166e6be1d18f7b3dc98c9`; the manifest digest binds tasks,
acceptance criteria, arms, and effort. A separate freeze binds the exact runner and common/workflow guidance. The historical run did not freeze its
imported helper source; the current runner repairs this limitation for future runs.
The workflow comparison measures only the injected guidance, not every implementation change in this patch.

Native CLI usage exposes input/output and cache-read counters. The CLI does not attest the effective model or internal
retry count in these records. Requested model IDs remain distinct from observed execution. Correctness and required
review are recorded separately from successful process exits. Versioned reports contain sanitized aggregate evidence;
full raw diagnostics and patches remain in the local pilot output directory, not in source control.

Known limitations include one observed model-capacity failure, one time-limited incomplete attempt, unavailable Vitest cache writes through the shared
read-only dependency link, and overlapping implementation validation on the same machine. These factors are retained
rather than discarded from the comparison. No end-to-end efficiency win or default-model promotion is established.

All 48 attempts finished: **46 complete, one capacity failure, one timeout**. Independent review accepted all 46
completed cases against their frozen acceptance criteria. The two unsuccessful attempts remain quality-unknown,
including a timed-out case with passing focused tests but extra template-sync activity. One completed review used
source and in-memory reproduction without running the existing test suite, which its acceptance criteria allowed.

The [sanitized evaluation packet](evaluations/native-20261017/README.md) retains all measurements, raw-file hashes,
quality provenance, and per-pair deltas. The original raw aggregate remains unchanged. The export reparses telemetry
with the corrected parser and records that provenance.

Completed-pair medians below are **descriptive only**, excluding unsuccessful pairs. They do not meet qualification
requirements: effective model and internal retries are unknown, the sample is incomplete, and host load was not
controlled. The evaluator returns `unknown` for both arms and authorizes no promotion.

| Comparison             | Completed pairs | Baseline/candidate median tokens | Baseline/candidate median elapsed |
| ---------------------- | --------------: | -------------------------------: | --------------------------------: |
| Model-only             |           15/16 |                313,488 / 254,843 |                59,198 / 47,967 ms |
| Guidance-only workflow |           14/16 |              305,923 / 250,985.5 |            56,058.5 / 43,211.5 ms |

All-attempt elapsed totals, including failures and setup, were 940,413 ms baseline, 749,688 ms model, and
932,741 ms workflow. Corresponding setup totals were 34,083 / 35,470 / 34,888 ms. Total-token observations cover
15/16, 16/16, and 15/16 attempts respectively; absent values stay unknown. Internal retries remain unknown in all
48 cases, and no manual corrections were made to case solutions. These are accumulated case times, not elapsed
wall time of the concurrent matrix.

## Rollout and rollback

Compatibility repairs and registry integration may ship with their deterministic validation. The fingerprint change
has a narrow traversal benchmark (368.755 to 3.455 ms median, 99.06% reduction, identical hashes); it does not imply a total-token or total-elapsed productivity claim. Model defaults
remain unchanged. Neither supplied report JSON nor a threshold calculation authorizes automatic promotion.

Keep this evaluation and the pinned base policy when considering a later model promotion. A future complete pilot
must resolve dependency-cache setup, capture effective execution evidence where available, preserve required review,
and meet the 10%/5% threshold independently for each comparison. Roll back the scoped implementation commit if its
mechanisms regress; retain the evaluation history. Do not revert or rewrite M02 evidence or unrelated working changes.

## Harness evolution observations

The implementation needed multiple review and static-analysis repair cycles. Independent review found measurement
integrity and cancellation defects that passing happy-path tests missed; the added regressions now cover those
boundaries. The expensive pilot also encountered a capacity failure and dependency-cache restrictions. Future
comparison work should qualify disposable-checkout test startup with a small smoke case before the full matrix,
reserve a quiet measurement window, and establish effective-model/retry evidence before expecting a promotion
decision. These are advisory observations, not new routing, permission, model, or review policy.

The local route receipt is `86153b6a-175c-4c44-ac7c-a99d9534fe7d`; scored-run receipt
`b2b98596-5181-43ca-adab-9d2ea12ddc9d` records review repairs and efficiency/coordination limitations. Independent review used a bounded assignment and
requested no inherited transcript; absent effective host attestation remains unverified. The source review and
deterministic checks establish the scoped implementation behavior, not host-enforced role or sandbox properties.
