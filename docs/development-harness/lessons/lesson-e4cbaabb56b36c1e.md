---
schemaVersion: 1
recordType: lesson
id: lesson-e4cbaabb56b36c1e
title: Durable replay precedes ephemeral authority checks
topic: durable replay precedes ephemeral authority checks
status: active
taskClasses:
  - cross-module-feature
paths:
  - src/services/coordinator/quality-journey-provider-run-service.ts
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-2eb8221c73d22b0d
counterexampleRefs: []
evidence:
  - id: obs-2eb8221c73d22b0d
    recordedAt: 2026-10-19T09:26:20.649Z
    summary: Exact replay of a committed operational receipt must not require recreating a process-local capability used only for its original effect.
    evidenceSummary: M04 independent review found reconciliation replay checked a lost sender-disable proof before its durable receipt. Receipt-first exact replay and independent restart regression corrected the boundary; new releases still require original disabled-sender proof, and consumed permits remain fenced.
    sourceType: source-review-and-sqlite-regression
    sourceRef: m04:reconciliation-restart-replay
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-10-19T09:26:20.649Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# Durable replay precedes ephemeral authority checks

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-2eb8221c73d22b0d: Exact replay of a committed operational receipt must not require recreating a process-local capability used only for its original effect. (M04 independent review found reconciliation replay checked a lost sender-disable proof before its durable receipt. Receipt-first exact replay and independent restart regression corrected the boundary; new releases still require original disabled-sender proof, and consumed permits remain fenced.)
