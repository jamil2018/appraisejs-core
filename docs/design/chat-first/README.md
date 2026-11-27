# AppraiseJS chat-first redesign

Phase 1 starts from `appraise-0.5` at `40e1296f`. This folder contains the
[interactive design prototype](prototype.html), [provider proof plan](provider-proof.md), and
[initial action inventory](action-inventory.md).

The [two-tier navigation concept](navigation.md) captures the current direction for design review.

## Walk through checkout

Open `prototype.html` in a browser. It uses a fictional Northstar Store project and sample data in the current tab.
Use the example in the composer or type “Check that a guest can buy one item.” Add “Also check that I get an order
number.” Review the revised scope, approve the checks, run the sample, and ask “Show me where” to open the failed
assertion. The failure is based on the guest checkout result recorded during the previous Journey redesign.

The sidebar also opens the interrupted Discount rules run. Browse workspace opens the case library and its editor.
Search and filter the library, open a case, and return to the same filters. **Discuss this** carries the chosen record
name into chat. Switch to **Empty project** to see the first-use states. Settings shows the two proposed provider
entry points and a light theme. The Quick jump palette opens with Cmd+K or Ctrl+K.

## Design choices to test

| Surface        | Prototype                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Home           | Start with a brief and surface pending reviews and interrupted work on the same screen.              |
| Test library   | Give the title and primary action one row, then put search and one filter next to the results.       |
| Case editor    | Group the record name, save state, and save action. Keep discussion attached to the record.          |
| Active Journey | Lead with stage, observed activity, and the precise revision and scope under review.                 |
| Failed run     | Lead with the observable failure. Keep the assertion, skipped checks, and logs available in context. |
| Settings       | List the two provider connection states and appearance alongside their actions.                      |

The prototype uses the app’s system typography and graphite palette. Desktop controls start at 36 px, and conversation
and tables use 16 px and 14 px type respectively. The prototype highlights revised criteria and displays an “Added”
label in reduced-motion mode.

## Feature branch

The live workspace has a collapsible desktop navigation pane, a project-scoped Journey brief and return queue, and
compact collections for authoring, configuration, execution, and reports. Compact tables with a project scope restore
their view within the same browser tab. **Use in a Journey** on a case, run, or report brings its verified record into
the new brief. An edited brief autosaves its record reference alongside the objective. Reports lead with confirmed
results and failed checks. Settings offers persistent Dark and Light appearances, the Codex diagnostic, and a local
ChatGPT authorization flow on macOS and Linux.

**New chat** opens a saved project conversation. Appraise can find cases, suites, templates, modules, tags,
environments, locators, locator groups, runs, and reports locally. Creation requests open the scoped editor for
review and save. Provider setup opens protected Settings with a return link to the saved chat.
Use **Attach** on a case result and send “Rename this case to …” to update its title in the same conversation. The
saved reply links to the actual editor. Cases, runs, and reports also offer **Discuss in chat**, which starts with the
exact record attached. Ordinary messages are saved as notes in the conversation.

Use **Discuss in chat** on a Journey to keep its current question, review, permission, or activity with the saved
conversation. Each card uses the same scoped Appraise records as the Journey page.

When a saved chat is attached to a Journey with a published test approach under review, **Proposed checks** lists
the acceptance signals for that revision. Reopening the chat reads the saved attachment and the active published
revision from Appraise. **Review this version** opens the Journey's requirements review.

With a published checkout review open in a saved chat, send “Also check that I get an order number.” Appraise saves
the message and requests a revision through the same Journey transition as the manual review. **Review changes**
appears when Appraise publishes the successor. It compares the successor with its immediate published predecessor
and shows the criteria added, changed, or removed. The exact review is required when submitting feedback.

A saved chat reloads the current Journey snapshot on reconnect or when the tab becomes visible. A newer snapshot
replaces a superseded review without clearing the draft message. The lookup provider picker continues to show the
original attempt and requires acknowledgement of an unknown outcome before it permits switching.

When Analysis needs a consequential choice, **Question** shows the saved prompt and any suggested answers. In
the saved Journey chat, reply with `Answer: Staging checkout` to record the choice. Once the current review is
published and Discovery setup is ready, type **Approve criteria** or use the button on the card. Both save the
decision through the same Appraise review as the Journey page. Appraise displays the approved revision in both views.

When the approved tests are prepared, choose the execution environment and select **Review run permission**.
The **Run permission** card shows the prepared tests, browser, and effects for that exact target. Select **Allow
and run these tests** to grant the separate permission and start the Appraise runner. **Activity** shows recorded
run status and links to the TestRun. Reopening the chat or changing the lookup provider restores the same attempt,
including any interruption that Appraise cannot yet reconcile.

After the run, **Result and evidence** distinguishes passing and failing checks, skipped steps, and runs whose
evidence Appraise could not verify. Select **Show me where** or type it in the saved chat to open the report at
the recorded step. The report opens with its test case, step status, and screenshot when available. The typed
reply retains the original step link in the transcript.

The chat renders this card through the pinned CopilotKit React headless renderer and a validated AG-UI tool-call
event. The renderer runs in the local Appraise page and needs neither a CopilotKit runtime server nor an account.
Appraise generates the event from its own scoped records. The event selects a renderer and carries the review
identity and check text. CopilotKit and AG-UI use the MIT license at the pinned versions, and the app manifest
disables Scarf installation analytics. [CopilotKit headless API](https://docs.copilotkit.ai/reference/v2/index) ·
[AG-UI events](https://docs.ag-ui.com/concepts/events) · [Scarf configuration](https://github.com/scarf-sh/scarf-js)

Appraise can verify a saved lookup after the user reviews the exact search terms. A conversation can use Local,
ChatGPT Responses, native Codex with a configured macOS app-server, Claude Code with a configured official macOS
binary, or Cursor with a pinned official macOS CLI bundle. The engine, attempt status, and verified records remain with the message. Unresolved attempts stay visible
after restart.

The local macOS preview completed live ChatGPT Responses, native Codex, Claude Code, and Cursor lookups for the
disposable checkout case. An uncoached first-use walkthrough, broader provider lifecycle coverage, and full action parity remain open.
The [provider proof](provider-proof.md) records the evidence and remaining checks. The
[action inventory](action-inventory.md) maps effects to current Appraise services.
