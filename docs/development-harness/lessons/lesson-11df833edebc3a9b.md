---
schemaVersion: 1
recordType: lesson
id: lesson-11df833edebc3a9b
title: Bind prerequisite reuse to source and output content
topic: bind prerequisite reuse to source and output content
status: active
taskClasses:
  - harness-configuration
paths:
  - scripts/
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-e449ff16acc26b90
counterexampleRefs: []
evidence:
  - id: obs-e449ff16acc26b90
    recordedAt: 2026-09-08T14:39:37.117Z
    summary: A cached prerequisite is reusable only while its source inputs, generated outputs, and toolchain remain unchanged.
    evidenceSummary: Integration tests cover output tampering, deletion, source changes during build, and content-preserving timestamp changes; the full root suite passed 1032 tests.
    sourceType: implementation-validation
    sourceRef: development-harness-enhancement-2026-09-08
    polarity: supports
    measurements:
      root-tests: 1032
      command-count: null
      agent-count: 4
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-08T14:39:37.117Z
lastResurfacedAt: null
reminderFingerprint: null
---

# Bind prerequisite reuse to source and output content

This advisory lesson applies to task classes: harness-configuration.

## Portable evidence

- obs-e449ff16acc26b90: A cached prerequisite is reusable only while its source inputs, generated outputs, and toolchain remain unchanged. (Integration tests cover output tampering, deletion, source changes during build, and content-preserving timestamp changes; the full root suite passed 1032 tests.)
