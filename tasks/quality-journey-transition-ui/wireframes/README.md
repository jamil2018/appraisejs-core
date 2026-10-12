# Journey wireframes: implementation reference

The user endorsed these wireframes on 2026-10-13 and requested that they accompany the implementation plan. This records design direction, not authorization to start implementation or change lifecycle gates.

- [Open the interactive wireframes](index.html): self-contained browser document; open locally or through a local static server. No Appraise server, login or model calls are required.
- [Editable source](journey-wireframes.fragment.html): the exact fragment presented in the conversation, retained in the repository so agents do not depend on a chat-only path.
- [UI plan](../plan.md): behavioral requirements and state/response mapping.
- [Task list](../todo.md): implementation sequencing and checks.
- [Screen sketches](../screens.md): textual layout reference.

Use the **Wireframe state** selector or **Previous/Next wireframe** buttons to inspect the 19 main states. In-screen actions simulate relevant transitions. The preview controls are outside the depicted product and must not ship as Journey controls. The optional in-conversation mobile toggle is host-provided; for the standalone document, resize the browser to inspect its responsive layout.

## State-to-task reference

| Selector label             | Source state ID | Implementation tasks               |
| -------------------------- | --------------- | ---------------------------------- |
| Brief review               | `brief`         | U00, U02; preserve existing intake |
| Background work            | `working`       | U01, U04, U10                      |
| Clarification              | `question`      | U03, U04                           |
| Approach review            | `approach`      | U03, U04                           |
| Review updated elsewhere   | `stale`         | U01, U04                           |
| Target inspection          | `discovery`     | U05, U10                           |
| Protected access           | `access`        | U05                                |
| Scenario review            | `scenarios`     | U05                                |
| Test preparation           | `preparing`     | U01, U04, U10                      |
| Run setup                  | `setup`         | U06                                |
| Execution permission       | `permission`    | U06                                |
| Ready to run               | `ready`         | U06                                |
| Tests running              | `running`       | U06, U08                           |
| Results and corrections    | `results`       | U07                                |
| Explicit risk acceptance   | `risk`          | U07                                |
| Unknown outcome            | `recovery`      | U08                                |
| Paused                     | `paused`        | U08                                |
| Read-only history          | `history`       | U02, U09                           |
| Closed with accepted risks | `closed`        | U07, U09                           |

Additional interaction-only views include revision feedback, revision waiting, access confirmation, pause reason, cancellation pending, correction preparation, updated approach and recorded closure. Explore them through the visible buttons rather than treating the selector as the entire UI contract.

## Guidance for implementation agents

1. Read the plan and the relevant task, then inspect its mapped wireframes before changing a component.
2. Preserve the design's single active task, meaningful primary action, explicit secondary choices, scope/consequences and quiet read-only history. Match hierarchy and interactions; adapt details to canonical data and existing product tokens.
3. Implement state selection from the server-derived projection. Do not transplant this mock's local `render`/`go` state transitions into production lifecycle logic.
4. Agent prose, completed turns, preview navigation and successful button clicks are not lifecycle acceptance. Preserve exact-version decisions, stale-review fencing, outcome reconciliation and the separate consent/start steps.
5. Do not infer completed stages from numeric position as this illustrative outline does. Derive reviewed/completed/revisited states from authoritative revision and cycle history.
6. Sample names, counts, results, scopes, question choices and progress messages are illustrative. Some preview paths jump immediately to an illustrative successor. Production must wait for the appropriate committed state and preserve actual answers, selections and failures.
7. Keep correction approval and eligible risk closure reachable together. A closed Journey with failed/inconclusive tests must retain those outcomes. Never copy illustrative availability as an authorization rule.
8. These wireframes do not cover every canonical condition. Use the plan's exhaustive fixtures for missing data, unsupported status, external-host setup, harmless execution policy, blockers, successful closure, expired/revoked permission and all revision/rerun loops. Missing variants are not permission to remove required behavior.
9. At each UI slice, compare the implementation with the mapped screens and record intentional deviations in the task evidence. Keep the plan, sketches and wireframe reference consistent when a design changes.

## Maintenance and verification

`journey-wireframes.fragment.html` is the editable visual source; `index.html` is its generated standalone preview. Do not patch the generated wrapper alone. Regenerate it with the visualize skill's `scripts/render.py <fragment> <index.html> --force` when that skill is available; otherwise preserve the source and explicitly record any export limitation. The committed standalone export can be opened without that skill.

The original preview received JavaScript syntax validation and browser checks for partial scenario decisions, preparation, separate consent/start transitions, console errors and narrow-layout bounds. This is prototype evidence only, not product validation or proof of the complete state matrix. Packaging checks verify source-copy identity, script syntax, exported document presence and documentation links.
