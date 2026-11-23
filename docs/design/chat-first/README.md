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

The dark palette and system typography come from [the current app theme](../../../src/app/globals.css).
Light mode is a prototype palette. Desktop controls start at 36 px, and conversation and tables use 16 px and
14 px type respectively. Motion is limited to highlighting a revised criterion. The same criterion gets an
“Added” label in reduced-motion mode.

The design still needs an uncoached first-time walkthrough and a same-data density comparison. The provider proof
needs both real subscription paths. The inventory covers the first implementation slice and needs completion before
full parity testing.
