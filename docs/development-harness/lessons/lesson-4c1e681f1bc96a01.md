---
schemaVersion: 1
recordType: lesson
id: lesson-4c1e681f1bc96a01
title: Verify native enforcement and teardown ordering
topic: verify native enforcement and teardown ordering
status: active
taskClasses:
  - localized-fix
paths:
  - src/services/coordinator/quality-journey-discovery-browser-transport.ts
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-230da411736f73eb
counterexampleRefs: []
evidence:
  - id: obs-230da411736f73eb
    recordedAt: 2026-11-12T15:24:55.856Z
    summary: Correct CDP parameters and visible headers did not prove worker prevention. Trace browser consumers and physical teardown; retain failed guards and use a causal regression before accepting a repair.
    evidenceSummary: M12 proposed CSP guard passed unit parameter checks but failed headed and headless worker prevention. Pinned Chromium keeps parsed policy separately from replaced headers. Later source tracing found private CDP pipes destroyed before process signaling; a fresh signal-hold regression reproduced a downstream worker effect on the old headed adapter and passed both modes with process-first teardown. Broader validation remains pending.
    sourceType: repository-evidence
    sourceRef: tasks/codex-app-server-journeys/M12-VERIFICATION.md
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-11-12T15:24:55.856Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# Verify native enforcement and teardown ordering

This advisory lesson applies to task classes: localized-fix.

## Portable evidence

- obs-230da411736f73eb: Correct CDP parameters and visible headers did not prove worker prevention. Trace browser consumers and physical teardown; retain failed guards and use a causal regression before accepting a repair. (M12 proposed CSP guard passed unit parameter checks but failed headed and headless worker prevention. Pinned Chromium keeps parsed policy separately from replaced headers. Later source tracing found private CDP pipes destroyed before process signaling; a fresh signal-hold regression reproduced a downstream worker effect on the old headed adapter and passed both modes with process-first teardown. Broader validation remains pending.)
