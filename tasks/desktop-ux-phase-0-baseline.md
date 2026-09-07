# Desktop UX Phase 0 baseline

Recorded 7 September 2026 from `appraise-0.5` at `bedf44a6`, before Phase 1 implementation.

This record refreshes the implementation assumptions in the [desktop UX plan](desktop-ux-improvement-plan.md). It
does not treat a saved receipt as live connectivity or a missing analysis revision as active work.

## Reproduction disposition

| Finding | Current disposition                                                                                         | Reproducible source or fixture                                           |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| F1      | Conditional; phone widths remain excluded and the desktop resize/zoom matrix remains Phase 2 work.          | Intake layout and shell overflow identified in the review.               |
| F2      | Reproduced. List/detail handoff wording can disagree with the absence of submitted analysis.                | Presentation unit fixtures and Journey list/detail component fixtures.   |
| F3      | Reproduced. Agent setup reaches project administration without contextual instructions or a journey return. | Handoff-panel and project-management component fixtures.                 |
| F4      | Reproduced; reserved for Phase 2.                                                                           | Manual case form, MultiSelect, error-message, and suite-picker fixtures. |
| F5      | Reproduced at the declared token-pair level; composited measurements remain Phase 2 work.                   | Shared theme tokens and representative route usages.                     |
| F6-F12  | Retained from the 7 September review and reserved for their planned phases.                                 | Existing route/component fixtures named in the review.                   |

Later-state UI tests must use canonical Journey, handoff, analysis, question, decision, execution, failure, and closure
inputs. Tests must not introduce UI-only lifecycle flags or alter the active project database.

## Agent support matrix

| Provider    | Setup and diagnostic                                                                                                                                  | Automatic launch                                                                                                                      | Journey connection and recovery evidence                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | Supported through the AppraiseJS MCP setup plus `project_diagnostic`. A receipt is a last observation, not a liveness probe.                          | Implemented for registered local workspaces through `codex app <workspace>`. Manual prompt copy remains required and is the fallback. | Implemented with one-time `quality_journey_handoff_redeem`; prepared, launching, launched, connected, failed, and expired records are observable. |
| Claude Code | No provider-specific setup or launch adapter is implemented by this UI slice. Generic MCP compatibility is not presented as verified Journey support. | Not implemented.                                                                                                                      | Not implemented or exercised.                                                                                                                     |
| Cursor      | No provider-specific setup or launch adapter is implemented by this UI slice. Generic MCP compatibility is not presented as verified Journey support. | Not implemented.                                                                                                                      | Not implemented or exercised.                                                                                                                     |

Preparation and local launch are UI-only. The public coordinator surface exposes safe handoff inspection and one-time
redemption; it does not grant lifecycle transition authority.

## Desktop verification contract

- Supported verification targets for this plan: 1440x1000 and 1280x800 desktop workspaces, plus a 960x720 compact
  companion window.
- Exploratory only until the product owner confirms a minimum: 720x800 side-by-side use.
- Accessibility checks remain separate at 200% and 400% zoom, keyboard operation, and screen-reader semantics.
- Phone layouts are unsupported and are not a release gate.
- Native restart, background service, notifications, updater, and desktop-shell behavior remain deferred.

The minimum supported native window size remains an unresolved product choice. Phase 1 can proceed because its state
and setup corrections do not depend on that choice; Phase 2 cannot claim its resize exit criterion until it is
confirmed.
