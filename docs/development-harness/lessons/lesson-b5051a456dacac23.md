---
schemaVersion: 1
recordType: lesson
id: lesson-b5051a456dacac23
title: Original native acquisition evidence boundaries
topic: original native acquisition evidence boundaries
status: active
taskClasses:
  - localized-fix
paths:
  - src/lib/quality-journey/codex-app-server/
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-c117043b620939ed
counterexampleRefs: []
evidence:
  - id: obs-c117043b620939ed
    recordedAt: 2026-11-14T15:44:52.007Z
    summary: Generic failure wrappers erased the phase needed to distinguish acquisition from readiness failures.
    evidenceSummary: A spent fresh native case retained UNKNOWN after CREATED with no READY; exact launch/model effects could not be recovered. A new real inert private-stdio child test failed in the sandbox but passed unchanged outside it through original claim, initialize and owned cleanup. Preserve both and distinguish infrastructure from product failure.
    sourceType: repository-runtime-diagnosis
    sourceRef: artifact:m13-c1-acquisition-diagnostics-20261114
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-11-14T15:44:52.007Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# Original native acquisition evidence boundaries

This advisory lesson applies to task classes: localized-fix.

## Portable evidence

- obs-c117043b620939ed: Generic failure wrappers erased the phase needed to distinguish acquisition from readiness failures. (A spent fresh native case retained UNKNOWN after CREATED with no READY; exact launch/model effects could not be recovered. A new real inert private-stdio child test failed in the sandbox but passed unchanged outside it through original claim, initialize and owned cleanup. Preserve both and distinguish infrastructure from product failure.)
