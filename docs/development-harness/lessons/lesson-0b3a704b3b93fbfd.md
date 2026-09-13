---
schemaVersion: 1
recordType: lesson
id: lesson-0b3a704b3b93fbfd
title: qualification negative tests must prove the intended boundary
topic: qualification negative tests must prove the intended boundary
status: active
taskClasses:
  - architecture-review
paths:
  - scripts/tests/p0-r2d-interlock-experiment.test.mjs
harnessVersion: "1"
confidence: medium
evidenceRefs:
  - obs-54f2d18856575ee3
counterexampleRefs: []
evidence:
  - id: obs-54f2d18856575ee3
    recordedAt: 2026-09-11T15:02:43.872Z
    summary: Early fixture tests rejected malformed wrappers before reaching the security condition under test; coordinator and judge corrected the experiment before retaining a no-go.
    evidenceSummary: P0.R2d evidence documents valid-positive and exact-reason regression repairs; 53 focused tests pass, live canonical schema loss remains blocked. Reuse of the complete R2c launch envelope and a minimal Seatbelt version probe resolved startup errors.
    sourceType: exact-artifact-review
    sourceRef: p0-r2d:0137fb2d4bdec734562c2c220dbc249e71b10fd19892caa0124fd2bf9421c32b
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-11T15:02:43.872Z
lastResurfacedAt: 2026-09-12T16:51:52.685Z
reminderFingerprint: architecture-review|scripts/lib/managed-journey-browser-qualification.mjs,src/lib/quality-journey,src/services/coordinator||obs-54f2d18856575ee3
revalidationEvidenceRef: null
---
# qualification negative tests must prove the intended boundary

This advisory lesson applies to task classes: architecture-review.

## Portable evidence

- obs-54f2d18856575ee3: Early fixture tests rejected malformed wrappers before reaching the security condition under test; coordinator and judge corrected the experiment before retaining a no-go. (P0.R2d evidence documents valid-positive and exact-reason regression repairs; 53 focused tests pass, live canonical schema loss remains blocked. Reuse of the complete R2c launch envelope and a minimal Seatbelt version probe resolved startup errors.)
