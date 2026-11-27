# AppraiseJS redesign · Chat first, compact throughout

Refresh the entire product around three questions a user should be able to answer at a glance: **What am I working on? What is happening? Does Appraise need anything from me?** Chat becomes the primary way to work. The manual workspace stays fully capable and uses the same navigation, language, components, and visual states.

Compactness comes first from removing repeated information and grouping related actions. The current **Test Cases** page, for example, defines a test case beneath its heading and explains creation again in its empty state. The redesigned page can say **Test cases**, show **New test case**, and use the available space for the cases themselves. On a decision screen, that same space is better spent showing exactly what the user is approving. [Current test-case page](https://github.com/jamil2018/appraisejs-core/blob/40e1296f/src/app/%28base%29/test-cases/page.tsx)

## Phase 1 · Establish the design and prove the providers

Start from `appraise-0.5` at `40e1296f`. Run three tracks in parallel.

| Track | Deliverable |
|---|---|
| **Product design** | Capture the current home, test library, case editor, active Journey, failed run, and settings. Prototype those six surfaces with realistic content, including a long test name, an empty project, an interrupted run, and a pending decision. Use the current system typography, theme tokens, and reduced-motion support as the starting point. [Current visual foundation](https://github.com/jamil2018/appraisejs-core/blob/40e1296f/src/app/globals.css) |
| **Provider integration** | Prove **Connect ChatGPT** and **Connect Claude** on a fresh local installation. Appraise detects or provisions the selected runtime, guides provider-owned sign-in, and completes a read-only Appraise action. Verify disconnect, expired sign-in, and interruption. The user completes this flow without operating a terminal or external coding app. [T3 Code onboarding](https://github.com/pingdotgg/t3code/blob/a369642c1c5c7a9a1e6b906167e3309005ad23e4/docs/user/providers-codex.md) · [Claude runtime conditions](https://code.claude.com/docs/en/legal-and-compliance) |
| **Product coverage** | Inventory each supported user action across screens, services, and shipped packages. Record its natural-language request, manual entry point, underlying operation, expected result, and recovery behavior. Assign an owner to every entry. This drives both the manual redesign and the chat parity tests. |

**Exit:** A first-time user can start a checkout check, change what will be tested, and explain a sample failure from the prototype. Both real subscription paths can complete the read-only operation.

## Phase 2 · Build one compact interaction system

The frontend team owns shared components and design tokens. Domain teams consume them in later phases. Apply the design references deliberately: Codex informs conversational steering, macOS informs focus and keyboard behavior, and Vercel informs typography, restrained color, and scannable data.

| Surface | Design decision |
|---|---|
| **Navigation and home** | Use a narrow, collapsible sidebar with the active project, **New chat**, recent conversations, and **Browse workspace**. Keep the command palette for direct navigation. An empty home opens on “What would you like to check?” A returning user sees unfinished work and decisions that need attention. Move the current metrics dashboard into the manual workspace. |
| **Lists and search** | Give each collection one title row, a primary action, and one toolbar for search and filters. Show active filters next to the results. Reveal bulk actions when rows are selected. Preserve search, selection, and scroll position when someone opens a record and returns. Extend the existing shared data table. [Current data table](https://github.com/jamil2018/appraisejs-core/blob/40e1296f/src/components/ui/data-table.tsx) |
| **Editors and details** | Put the record name, save state, and primary action together. Group fields by the task they support. Keep advanced configuration behind a named disclosure. Place **Discuss this** beside the record so the user can move into chat with the exact case, run, or report already in context. |
| **Journeys and results** | Show the current stage, one observed activity line, and the decision or result. Put history, logs, and technical identifiers one level deeper. Lead a failed run with what the user could observe, followed by the affected step and its evidence. Keep failures, skipped checks, and unverified work distinguishable. |
| **Density and typography** | Use a 4 px spacing scale, a 16 px default for conversation and reading, and a 14 px default for table content. Start with 36 px desktop rows and controls, allow wrapping, and enlarge touch targets on coarse-pointer devices. Use one primary action per task area. Reserve bordered cards for content people review, act on, or return to. |
| **Color and motion** | Use one accent for selection and the primary action. Pair outcome colors with words or icons. Use short transitions to show what changed: a revised criterion gets a brief highlight, an evidence row expands in place, and running status settles into a result. New activity preserves the user’s reading position. Reduced-motion mode communicates the same changes immediately. |

Build these patterns in light and dark themes using real Appraise data. Treat the sizes above as prototype defaults and validate them with zoom, keyboard navigation, screen readers, and touch.

## Phase 3 · Connect the agent to the interface

Run three implementation lanes against agreed contracts.

- **Runtime and persistence.** Give each project conversation a durable Appraise ID, saved messages, pending questions, and links to records. Run Codex or Claude Code behind provider adapters. Adopt T3 Code’s bounded replay and snapshot approach for reconnects, and OpenDesign’s handling of provider-specific events. Explicit provider switching preserves the conversation and reconciles outstanding work before another engine can act. [T3 Code thread stream](https://github.com/pingdotgg/t3code/blob/a369642c1c5c7a9a1e6b906167e3309005ad23e4/apps/server/src/orchestration-v2/ThreadStream.ts) · [OpenDesign adapter guide](https://github.com/nexu-io/open-design/blob/5fdcc3db1e31bd4fa70f673041b78e87977507c3/docs/agent-adapters.md)
- **Actions and decisions.** Route chat and manual controls through the same Appraise services. Apply clear, reversible edits directly. Ask a focused question when the target is ambiguous. For destructive changes, external effects, and required Journey decisions, show the exact target, scope, and revision. A typed reply or optional button records the user’s decision through the same trusted path. Duplicate messages and stale cards must be safe.
- **Interactive components.** Use CopilotKit’s headless React integration and AG-UI events to render six Appraise components: **Question**, **Proposed checks**, **Review changes**, **Activity**, **Run permission**, and **Result and evidence**. The agent selects the component suited to its intent and supplies validated data. Ordinary replies stay plain text. Use AI SDK UI for composer and streaming patterns and ChatKit for actionable widget examples. [CopilotKit](https://docs.copilotkit.ai/) · [AG-UI events](https://docs.ag-ui.com/concepts/events) · [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview) · [ChatKit widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)

**Exit:** On either provider, a user can find a case in chat, rename it, inspect it in the refreshed library, edit it manually, and continue the conversation with the updated record. Refreshing either view preserves the work.

## Phase 4 · Prove one complete Journey, then refresh every domain

Use guest checkout as the first complete experience. The user types *“Check that a guest can buy one item.”* Appraise shows proposed checks. The user adds *“Also check that I get an order number.”* Only the changed criterion highlights. After the user approves the displayed scope, Appraise runs the test and reports *“The purchase succeeded. The confirmation was missing an order number.”* Asking *“Show me where”* opens the relevant step and evidence.

Run passing and deliberately failing variants on both providers. Include a manual edit while review is open, a pause, a reconnect, and a return visit. Once the slice passes, four domain teams can work independently:

| Team | Chat coverage and manual screens |
|---|---|
| **Authoring** | Modules, suites, cases, steps, tags, templates, bulk edits, and publication. Apply the collection and editor patterns. |
| **Projects and setup** | Project switching, environments, locators, inspection, settings, and help. Put protected sign-in and secret entry in appropriate secure surfaces. |
| **Journeys and runs** | Discovery, reviews, preparation, execution, cancellation, recovery, remediation, reruns, and closure. Apply the activity and decision patterns. |
| **Reports and collaboration** | Dashboard metrics, run comparisons, diagnostics, evidence, export, collaboration proposals, and recovery. Apply the outcome-first detail pattern. |

Each team delivers the redesigned manual flow, its text equivalent, and parity tests together. Shared component changes go through the frontend owner so all four domains inherit the same behavior.

## Phase 5 · Qualify the experience and launch at full parity

- **Usability and density:** Compare the redesigned screens with the Phase 1 baseline at the same viewport using identical data. Measure time to find a case, identify the next decision, understand a failure, and resume work. Verify that the compact library shows more useful records and that first-time users can still discover the primary actions without coaching.
- **Accessibility and resilience:** Test keyboard-only use, screen-reader announcements, light and dark themes, reduced motion, 200% zoom, and narrow layouts. Exercise long content, empty data, slow responses, stale approvals, duplicate events, expired credentials, and server restarts.
- **Product parity:** Every inventory entry passes through text on both providers and produces the expected Appraise record or effect. Existing manual links, filters, drafts, approvals, and historical evidence survive the upgrade. A lost response or provider switch cannot repeat an uncertain test run.
- **Packaging and cutover:** Rehearse fresh install, upgrade, and rollback on every advertised platform. Update the scaffold, onboarding, help, and operator guides. Verify a Claude-only installation with Codex absent and a ChatGPT-only installation with Claude Code absent. Retire external handoff prompts and mandatory product plugin setup when both paths pass.

The critical path is **provider proof and screen prototypes → shared design and action contracts → complete checkout Journey → parallel domain migration → full-parity launch**. This puts the UX refresh at the beginning, while design decisions can still shape the product, and makes every domain responsible for delivering it.
