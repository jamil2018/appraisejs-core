# Desktop UX Phase 4 evidence

Date: 2026-09-08

## Implemented

- `Case Templates` is the primary presentation name in the sidebar, command palette, dashboard action, list/create/modify headings, and Test Case form. Internal `TemplateTestCase` identifiers remain unchanged for compatibility.
- Help is a stable route and System navigation destination. Command search indexes it under help, setup, glossary, approvals, and recovery.
- Help explains the guided Journey, manual authoring, exact approvals, observation limits, recovery, and an illustrative checkout flow. Viewing it has no mutation path.
- Settings is now an active-project configuration overview with real links to Projects, Environments, and Codex setup. It explicitly avoids implying hidden native preferences or filesystem sync.
- `docs/desktop-navigation-and-help.md` records the vocabulary and authority boundaries.

## Verification

- Focused navigation helper and command palette tests passed, including a `glossary` search that routes to Help.
- The local Help route exposed the worked example and glossary through keyboard-readable structure.
- Live command search for `glossary` returned Help as the only result.
- Settings rendered all three implemented destinations with the active project ID preserved.
- No browser console errors or warnings were observed.
- Canonical root changes were synchronized to `packages/create-appraisejs/templates/base`.

## Open evidence gate

The plan requires intended-user first-click validation before changing navigation group placement. No intended-user participants have completed that exercise, so the proposed regrouping was not shipped and Task 4.1 remains open. This preserves every current route and avoids presenting an automated code check as user research.

The in-app Browser remained unavailable because the Mac was locked; the documented Playwright CLI fallback was used.
