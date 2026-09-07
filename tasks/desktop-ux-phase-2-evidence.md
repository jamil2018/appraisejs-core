# Desktop UX Phase 2 evidence

Date: 2026-09-08 (Asia/Dhaka)

## Accessible controls and errors

- `MultiSelect` now accepts stable IDs, field-specific trigger and search names, required/invalid state, and an error-description target.
- Manual test-case Title, Test Suites, and Filter Tags use their visible field names programmatically. Empty Continue exposes Title and Test Suites as invalid and links each to its exact error text.
- Picker search inputs have explicit names. Closing the Test Suites popover with Escape returned focus to the `test-suites` trigger.
- `ErrorMessage` retains a stable description target and becomes a polite alert only when an error is visible.

The in-app browser accessibility tree exposed `Test Suites`, `Filter Tags`, and `Search test suites` distinctly. Its console contained no warnings or errors during the walkthrough.

## Contrast measurement

The prior `--muted-foreground` value, `oklch(0.551 0.0234 264.3637)`, measured 3.03:1 against `--card` and 3.69:1 against `--background`. The replacement, `oklch(0.67 0.0234 264.3637)`, measures 4.88:1 and 5.96:1 respectively using WCAG relative luminance after OKLCH-to-linear-sRGB conversion. This closes the declared ordinary-text token pairs without claiming whole-application WCAG certification.

## Desktop and zoom matrix

| Condition | Result |
| --- | --- |
| 1440x1000 | No document horizontal overflow; Title, selectors, and Continue were within the viewport. |
| 1280x800 | No document horizontal overflow; essential controls were within the content bounds. |
| 960x720 | No horizontal overflow; vertical page scrolling retained access to controls. |
| 720x800 exploratory | No horizontal overflow; vertical page scrolling retained access to controls. |
| 200% effective reflow | No horizontal overflow; controls remained reachable with vertical scrolling. |
| 400% effective reflow (320 CSS px at 1280 desktop width) | No horizontal overflow; the compact navigation layout and vertically scrolling form retained controls. |

The repository-preferred in-app browser is fixed at 1280x720 and cannot emulate viewport or zoom. A temporary isolated Playwright CLI session was therefore used only for the remaining geometry matrix. Native VoiceOver/NVDA interaction was not available; semantic accessibility-tree and keyboard checks are recorded separately rather than presented as native assistive-technology certification.
