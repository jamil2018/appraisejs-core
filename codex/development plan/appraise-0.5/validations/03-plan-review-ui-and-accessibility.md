# 03 - Plan Review UI and Accessibility

## Goal

Prove the AppraiseJS review surface lets users inspect the same plan through graph and list views with accessible,
keyboard-operable controls.

## Builds On

- Pass 02 produced a review-ready, discoverable plan with stable links and projection evidence.

## Validation Scope

- Graph/list parity.
- Task ordering and stage grouping.
- Edge direction and labels.
- Accessible labels and keyboard review.
- Graph failure fallback to list review.
- Layout save/reset behavior.
- Approval controls remain disabled until review is ready.

## Suggested Actions

1. Use a plan with multiple tasks, dependency edges, blocking edges, and parallel groups.
2. Validate graph rendering and list rendering show the same semantic order.
3. Exercise keyboard navigation across tabs, task list, remarks, layout controls, and approval button.
4. Force graph data failure or projection issue and confirm fallback remains reviewable.
5. Add focused component tests and selected Playwright coverage for real browser behavior.

## Evidence To Capture

- Screenshots or Playwright traces for graph view, list view, and fallback state.
- Component tests proving task ordering, edge labels, layout reset/save, and approval button wiring.
- Accessibility assertions for labels, roles, and keyboard-operable controls.

## Exit Criteria

- Users can review the plan without relying on the graph canvas alone.
- Graph and list views present equivalent review information.
- Next pass may validate user remarks, revisions, and approval authority.
