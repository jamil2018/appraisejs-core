---
schemaVersion: 1
recordType: improvement-proposal
id: proposal-ccb1c2b7efb7c47f
title: Add phase and identity coverage for original custody changes
status: proposed
problem: Green focused tests left post-completion producer, pending-finalizer, replay-identity and pre-reservation mutation windows for independent review to find.
supportingRecords:
  - obs-4a44cf82cb38a42c
  - obs-c117043b620939ed
suggestedChange: Extend the advisory custody review recipe with a phase-by-identity matrix, original promise settlement checks and mutation tests before spending runtime qualification allowances.
expectedBenefit: Find lifecycle and identity omissions before effectful cases without replacing independent artifact review.
effort: M
risks:
  - Avoid duplicating implementation assertions or treating test coverage as host attestation.
acceptanceMeasurements:
  - Exercise completion-before-ack, passive-after-completion, pending finalizer, wrong replay identity and source drift before reservation on the next custody change.
taskClasses:
  - cross-module-feature
paths:
  - src/lib/quality-journey/codex-app-server/
supportingEvidence:
  - id: obs-4a44cf82cb38a42c
    recordedAt: 2026-11-14T10:55:46.407Z
    summary: Independent review found uncovered lifecycle and replay identity boundaries after focused native-custody tests passed.
    evidenceSummary: Predecessor C1 review identified same-turn producers after completion, final stop persistence still pending, omitted original replay intent identity, and missing pre-reservation source revalidation. No native model case had started; fixes and exact successor review remain required.
    sourceType: independent-repository-review
    sourceRef: artifact:m13-c1-predecessor-3134a65e
    polarity: supports
    measurements:
      reviewer-findings: 4
      elapsed-ms: null
      tokens: null
  - id: obs-c117043b620939ed
    recordedAt: 2026-11-14T15:44:52.007Z
    summary: Generic failure wrappers erased the phase needed to distinguish acquisition from readiness failures.
    evidenceSummary: A spent fresh native case retained UNKNOWN after CREATED with no READY; exact launch/model effects could not be recovered. A new real inert private-stdio child test failed in the sandbox but passed unchanged outside it through original claim, initialize and owned cleanup. Preserve both and distinguish infrastructure from product failure.
    sourceType: repository-runtime-diagnosis
    sourceRef: artifact:m13-c1-acquisition-diagnostics-20261114
    polarity: supports
    measurements: {}
lastResurfacedAt: null
reminderFingerprint: null
lastEvidenceAt: 2026-11-14T15:44:52.007Z
history:
  - at: 2026-11-14T10:55:57.659Z
    from: null
    to: proposed
    reason: Recorded as advisory backlog.
    revisitCondition: null
    authority: null
    evidence: null
---

# Add phase and identity coverage for original custody changes

This is an advisory improvement backlog record. Its status never blocks unrelated task completion.

## Portable supporting evidence

- obs-4a44cf82cb38a42c: Independent review found uncovered lifecycle and replay identity boundaries after focused native-custody tests passed. (Predecessor C1 review identified same-turn producers after completion, final stop persistence still pending, omitted original replay intent identity, and missing pre-reservation source revalidation. No native model case had started; fixes and exact successor review remain required.)
- obs-c117043b620939ed: Generic failure wrappers erased the phase needed to distinguish acquisition from readiness failures. (A spent fresh native case retained UNKNOWN after CREATED with no READY; exact launch/model effects could not be recovered. A new real inert private-stdio child test failed in the sandbox but passed unchanged outside it through original claim, initialize and owned cleanup. Preserve both and distinguish infrastructure from product failure.)
