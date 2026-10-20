---
schemaVersion: 1
recordType: lesson
id: lesson-d6c995761cc8a20c
title: owned RPC synchronous write fencing
topic: owned rpc synchronous write fencing
status: active
taskClasses:
  - cross-module-feature
paths:
  - src/lib/quality-journey/codex-app-server
  - src/services/coordinator/quality-journey-process-supervisor.ts
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-14ff3e7ade406f94
counterexampleRefs: []
evidence:
  - id: obs-14ff3e7ade406f94
    recordedAt: 2026-10-20T09:13:19.670Z
    summary: Preserve private startup bytes and validate original ownership at every protocol write.
    evidenceSummary: M05 real Node fixtures exposed Execa automatic stream draining before handler attachment; synchronous pause preserved startup bytes. Independent SQLite review reproduced copied-permit pre-turn writes; WeakMap ownership checks and phase regressions now reject them without I/O. Process drain remains distinct from provider termination.
    sourceType: owned-fixture-and-independent-review
    sourceRef: tasks/codex-app-server-journeys/M05-CURRENT-WORK-01.md
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-10-20T09:13:19.670Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# owned RPC synchronous write fencing

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-14ff3e7ade406f94: Preserve private startup bytes and validate original ownership at every protocol write. (M05 real Node fixtures exposed Execa automatic stream draining before handler attachment; synchronous pause preserved startup bytes. Independent SQLite review reproduced copied-permit pre-turn writes; WeakMap ownership checks and phase regressions now reject them without I/O. Process drain remains distinct from provider termination.)
