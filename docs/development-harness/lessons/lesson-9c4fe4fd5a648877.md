---
schemaVersion: 1
recordType: lesson
id: lesson-9c4fe4fd5a648877
title: 'operability: Managed preparation did not preflight the cucumber runtime build'
topic: operability managed preparation did not preflight the cucumber runtime build
status: stale
taskClasses:
  - cross-module-feature
paths: []
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-e221e36619fe851c
counterexampleRefs: []
evidence:
  - id: obs-e221e36619fe851c
    recordedAt: 2026-09-08T14:37:32.738Z
    summary: Managed preparation did not preflight the cucumber runtime build
    evidenceSummary: assessment_prepare_run failed on missing packages/cucumber-runtime/dist/index.js and required a rebuild plus fresh run
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

# operability: Managed preparation did not preflight the cucumber runtime build

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-e221e36619fe851c: Managed preparation did not preflight the cucumber runtime build (assessment_prepare_run failed on missing packages/cucumber-runtime/dist/index.js and required a rebuild plus fresh run)
