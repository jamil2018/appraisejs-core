# Journey transition flow: screen sketches

These are proposed layouts with illustrative content, not screenshots or observed Journey outcomes. They define hierarchy and action placement; existing product tokens remain the styling reference. See [plan](plan.md).

[Interactive wireframes](wireframes/index.html) · [Implementation guide and state map](wireframes/README.md)

## Shared frame

```text
← Quality Journeys                       Pause (when applicable)
Checkout works for returning customers
Storefront · Staging                      Test approach · Needs review

Brief ✓ — Approach [current] — Scenarios — Preparation — Run — Results

┌──────────────────────────────────────────────────────────────────┐
│ ONE CURRENT TASK                                                 │
│ What you need to decide / what Appraise is doing                  │
│                                                                  │
│ Relevant form or review content                                  │
│ Essential risks and scope                                        │
│                                                                  │
│ [Primary action]   Secondary choice                               │
│ What this action does next                                       │
└──────────────────────────────────────────────────────────────────┘

Previous decisions     Files and evidence     Technical details
```

Pause opens a reason form only when requested. While running, a directly accessible Stop action identifies what it stops and distinguishes requested cancellation from confirmed termination. No duplicate “pending decisions” card or all-stage sidebar.

## A. Work in progress

```text
Preparing your test approach
Appraise is reviewing the brief. No action is needed now.

Last confirmed activity: requirements loaded
Next: answer any questions, then review the proposed approach.

You can leave this page and return later.
```

Use this language only when actual runtime observations support it. External mode with no connected/active worker instead shows the required connection task. No fabricated percentage, countdown or claim that an observed connection is a live worker. If progress is unavailable, show that fact and a manual status-check action.

## B. Clarification form

```text
One detail is needed before we can continue
Should checkout accept guest orders?

( ) Yes, include guest checkout
( ) No, test signed-in customers only

Additional context (optional)
[________________________________________________]

[Save answer]                            Save state: Unsaved
Next: Appraise updates the proposed approach.
```

Input type comes from a supported structured question; do not invent answer options for a free-text canonical question. Multiple related required questions can share a form, with per-answer save results. Save is not approval. A new revision never silently inherits an answer to a different question.

## C. Approach review

```text
Review the proposed test approach
Version 2 · Based on your latest answers

Will cover
• Signed-in checkout with a valid card
• Required-field and declined-payment handling

Not covered
• Guest checkout, as requested

Assumptions / unresolved limits
[Only relevant items; full detail expandable]

[Approve this approach]      Request changes
Next: Appraise inspects the target and prepares test scenarios.
```

The review remains pinned while being read. A newer revision disables stale decisions and offers “Load latest”; it does not swap the content below the pointer.

## D. Scenario review

```text
Review the test scenarios
3 pending decisions · 1 coverage gap needs attention

[ ] Successful checkout                View steps
[ ] Declined payment                   View steps
[ ] Required address fields            View steps

[Coverage gap and affected requirement clearly shown]

0 scenarios selected
[Approve selected scenarios — disabled]    Add feedback

View scenario relationships   Previous scenario versions
```

Selecting all is explicit and shows the count/scope. Per-item feedback belongs to that item; portfolio feedback is labeled separately. Blocking coverage/comments prevent advancement even after a valid partial decision. The graph is available, not the required first view.

## E. Run setup, permission, then launch

```text
Review this test run
Target: Storefront staging
Checks: 3 approved scenarios
Browser: Chromium
Effects: creates test orders; uses the configured test account

[Review required permission]
```

```text
Allow these test actions
[Exact human-readable scope, effects and any expiry]

[Allow this scope]                  Back to run setup
Next: the approved run becomes eligible to start.
```

```text
Ready to run
Permission is recorded for the scope shown above.

[Start this run]                    Change setup
```

These are separate task variants, not three cards stacked on one screen. Only display a permission task when the canonical service requires it. Changing scope invalidates the permission preview and requires rechecking. Do not call a request-for-consent a launched run. A combined “Allow and run” action is deferred pending a separately reviewed authority/recovery contract.

## F. Results with corrections

```text
Review proposed corrections
2 checks failed · 1 inconclusive · Scope shown below

Proposed correction: [plain-language exact scope]
What changes / what remains uncertain: [review material]
Decision rationale (required)
[________________________________________________]

[Approve proposed corrections]     Request report changes
Review and accept remaining risks (when closure is eligible)
Next: Appraise prepares the approved correction cycle.
A new run will still need its applicable permission.
```

When risk closure is eligible on the same report, its visible secondary choice opens the explicit risk acknowledgement/rationale form. The presence of proposed corrections must not force the user to accept them. No option is selected or submitted automatically.

## G. Eligible closure review

```text
Review the results
[Observed outcome, coverage and unresolved risks]

[Finish Journey]                   Request report changes
Next: Appraise records closure for this report version.
```

This closure view can also be reached from a report that proposes corrections when canonical eligibility permits it. When unresolved risk requires acceptance, replace the primary action with “Review and accept remaining risks”, reveal the explicit risk acknowledgement/rationale form, and preserve the failed/inconclusive result labels. Do not use a green success screen merely because the Journey closes.

## H. Recovery and prior work

```text
Progress needs checking
Appraise cannot confirm whether the last operation completed.
It has blocked another attempt to avoid repeating the action.

[Check operation outcome]           View details
Your previous decisions are saved.
```

Only show a recovery action that exists and is currently permitted; otherwise state who must resolve the issue. Do not offer Retry or Resume while outcome is unknown.

```text
Viewing an earlier decision                     Return to current step
Test approach · Version 1 · Replaced by version 2

[Read-only content and recorded decision]
```

Opening history never activates its old controls. Browser Back restores the selected read-only view or current canonical task; it never reverses a domain transition.
