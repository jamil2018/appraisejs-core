---
schemaVersion: 1
recordType: lesson
id: lesson-48f0f02386bb6b9d
title: 'efficiency: Lifecycle full responses were very large'
topic: efficiency lifecycle full responses were very large
status: stale
taskClasses:
  - cross-module-feature
paths: []
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-06165a66f37492e2
counterexampleRefs: []
evidence:
  - id: obs-06165a66f37492e2
    recordedAt: 2026-09-08T14:37:32.745Z
    summary: Lifecycle full responses were very large
    evidenceSummary: assessment_diagnose review and decide returned roughly 14KB payloads with repeated realization data
    sourceType: legacy-run-evolution
    sourceRef: run:83f6fad9-8225-4f32-827b-a3a09d6a3579
    guidance: Apply the reported identity, delegated MCP bridge, runtime readiness, assessment matrix defaulting, compact response, and responseMode discovery optimizations.
    polarity: neutral
    measurements: {}
    observedAt: 2026-08-20T18:25:05.980Z
ambiguousObservationRefs: []
lastValidatedAt: 2026-08-20T18:25:05.980Z
lastResurfacedAt: null
reminderFingerprint: null
---

# efficiency: Lifecycle full responses were very large

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-06165a66f37492e2: Lifecycle full responses were very large (assessment_diagnose review and decide returned roughly 14KB payloads with repeated realization data)
