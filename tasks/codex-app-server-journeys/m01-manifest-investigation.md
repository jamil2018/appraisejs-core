# M01 catalog/manifest investigation — corrected interpretation

Date: 2026-10-14 (Asia/Dhaka). **M01 partial. No new thread/turn, inference or permission grant.**
Intake: clean `7f644b2e` on `codex/journey-app-server-migration`; origin and other worktrees inspected
without changing them. Latest instruction authorizes investigation only, with no more inference or
broader permissions. The three native starts remain consumed. M00-r3 hash and GC3 REVISE remain intact.

## Finding

The fixture's retained `toolNames: []` came from `body.get("tools", [])` only. It did not inspect
`input[].additional_tools`. Therefore the old reports establish **no top-level tool names captured**,
not an empty whole-request manifest or unavailable MCP tool. Historical JSON/source commits remain
unchanged; earlier absence/empty-manifest conclusions are superseded by this correction.

The pinned executable embeds `gpt-6.1-sol` with `tool_mode="code_mode_only"` and
`use_responses_lite=true`. [Offline diagnostic](m01/manifest-offline-diagnostic.json) records only
allowlisted metadata, executable/config/source hashes and the selected model object hash. It reads
no credentials, cache identity, transcript or provider payload and launches no CLI/app-server.
The unsigned fixture has no model cache. The canonical complete embedded model-object hash matches
the immutable release source object:
`cded3b4b9f66487981455f57684a118512617cff6488f8bff8b069c3414bf42d`.
No model instructions or schema bodies are exported from that object.

Two source mechanisms explain the mismatch:

1. **Serialization location:** Responses Lite adds nonempty prompt tool schemas to a developer
   `additional_tools` input item and omits top-level tools. See
   [client.rs:915](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/client.rs#L915)
   and [ResponseItem schema:1014](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/protocol/src/models.rs#L1014).
   Reading only top-level tools necessarily misses this manifest when the Lite path is selected.
2. **Callable surface:** model tool-mode metadata takes precedence over local feature flags.
   `code_mode=false` does not force Direct for this CodeModeOnly model. The source hides nested-capable
   MCP tools from direct visibility and registers the Code Mode executor. See
   [mode selection:76](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/mod.rs#L76)
   and [tool-plan filtering/executor:838](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/src/tools/spec_plan.rs#L838).
   A catalogued MCP tool need not appear as a direct `mcp__...__elicit` function; the fixture's
   assumed direct function-call path is not qualified for this model. This is not evidence that
   Code Mode or other native effects were absent in prior native requests.

The initial hypothesis that disabling Code Mode removed every tool was corrected after source review.
Do not enable it, change model metadata, switch models, inject an exec call or widen tools to repair
this observer. These would not verify the original surface under the current instruction.

## Source and evidence limits

[Source pin](m01/manifest-source-pin.json) resolves official tag `rust-v0.162.0-alpha.17.2` through
annotated tag object `f04373e4fb0767b92277665293da747bcc0cb27c` to commit
`740e5af33c71225640e0c1c1555c514c2c93ab74`, with six fetched file hashes. Matching CLI version and
the exact embedded model object support this explanation. They do not attest that the entire Mach-O
binary was reproducibly built from that commit; full build provenance remains unverified.

The same immutable source includes
[`base_instructions_use_input_items`](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/core/tests/suite/responses_lite.rs#L94):
the Lite case asserts top-level tools are absent and checks `additional_tools` and namespaced executor
tools. These Rust tests were read, not executed. The investigator initially could not fetch the tagged
test; the coordinator fetched and verified it at the immutable commit. Line references here use those
fetched bytes rather than earlier unverified tag-page line numbers.

The original provider body was not retained, so this investigation cannot retroactively observe whether
it contained the alternate manifest or exactly which tools/guidance were present. Source-supported
causality is distinct from a new pinned-host request observation. No new provider request was made.
Actual elicitation/permission denial, native tool isolation and wider model/build support remain open.

## Repository correction and verification

[Fixture parser](../../scripts/tests/fixtures/codex-app-server-m01/mcp-elicitation-probe.py) now reads
both top-level and Lite manifest locations, recursively records namespace-qualified names/types,
distinguishes an omitted field from an explicitly empty array, and rejects malformed tool items.
It retains no message text, descriptions, parameter schema bodies or tool arguments. The scripted
handler still refuses an unsupported direct-call surface; it does not automatically run Code Mode.
No live invocation of this corrected handler is claimed.

[Four deterministic regressions](../../scripts/tests/codex-app-server-m01-manifest.test.py) cover
standard direct calls, a Lite namespaced exec/wait manifest, explicit emptiness, malformed definitions,
and exclusion of synthetic message/schema text. They require no CLI, sockets, auth or inference.
The offline metadata diagnostic is independently rerunnable against the retained unsigned fixture.
Existing Node checks and native guards remain separate earlier protocol/guard evidence.
Focused Ruff/formatting, documentation/task links, source/evidence hash binding and enabled local hooks
validate this change. Graphify has no changed safe committed scope for these Python/docs artifacts.
No product build, template, migration, UI or M02 work was performed.

Route `8c19c15a-45ed-4930-b2ed-e103e4d85345` was recorded before one bounded read-only investigator
source lane. The coordinator owned local binary/config inspection and edits; there was no overlapping
write or new runtime probe. Role/model/context/sandbox enforcement remains unverified without effective
host receipts. Advisory lesson: qualify model-selected serialization and callable surfaces before
interpreting an HTTP field as an absent tool; feature values alone are not effective-tool attestations.
No harness policy changed.

## Same-branch handoff

M01 is partial; three of three native inference starts consumed. Preserve all historical observations
and retained native history, M00's approved bytes plus separate auth amendment, and GC3 REVISE.
Under current authority, continue only source/schema/deterministic preparation. A future separately
authorized live fixture must capture metadata from both manifest locations, identify the actual callable
surface, and stop before unsupported/native effects; qualify elicitation/permission behavior independently.
Do not use more inference, broaden permissions or start M02+ to force coverage. Local commits with hooks
only; no push, merge or publication. This handoff belongs to `test: correct M01 Responses Lite manifest inspection`.
