---
schemaVersion: 1
recordType: lesson
id: lesson-c783e4d70c22e11f
title: fixture failure continuation and actual operation retention
topic: fixture failure continuation and actual operation retention
status: active
taskClasses:
  - cross-module-feature
paths:
  - scripts/test-harness/m06
harnessVersion: "1"
confidence: medium
evidenceRefs:
  - obs-ca76f36fe5f82a6e
counterexampleRefs: []
evidence:
  - id: obs-ca76f36fe5f82a6e
    recordedAt: 2026-10-22T06:39:00.943Z
    summary: Static equivalence and successful type checks do not establish failure-latched continuation safety.
    evidenceSummary: Independent exact review of an unexecuted source controller found that IPC failure could resume into new fixture cleanup and several actual journal operations bypassed current-phase Promise retention. Adjacent service inspection found the same issue. Execution stayed blocked; new admission guards and exact-operation retention require a new frozen review.
    sourceType: independent-review
    sourceRef: custody-source-regression8-controller-review-SR8-R1-R2
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-10-22T06:39:00.943Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---
# fixture failure continuation and actual operation retention

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-ca76f36fe5f82a6e: Static equivalence and successful type checks do not establish failure-latched continuation safety. (Independent exact review of an unexecuted source controller found that IPC failure could resume into new fixture cleanup and several actual journal operations bypassed current-phase Promise retention. Adjacent service inspection found the same issue. Execution stayed blocked; new admission guards and exact-operation retention require a new frozen review.)
