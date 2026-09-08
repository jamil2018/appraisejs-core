---
schemaVersion: 1
recordType: lesson
id: lesson-b8f25a658297cdc6
title: 'operability: Fresh reset left the running coordinator identity stale'
topic: operability fresh reset left the running coordinator identity stale
status: stale
taskClasses:
  - cross-module-feature
paths: []
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-8a1f20dbacb1721f
counterexampleRefs: []
evidence:
  - id: obs-8a1f20dbacb1721f
    recordedAt: 2026-09-08T14:37:32.726Z
    summary: Fresh reset left the running coordinator identity stale
    evidenceSummary: HTTP MCP returned 401 and diagnostic returned 500 until the dev supervisor restarted
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

# operability: Fresh reset left the running coordinator identity stale

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-8a1f20dbacb1721f: Fresh reset left the running coordinator identity stale (HTTP MCP returned 401 and diagnostic returned 500 until the dev supervisor restarted)
