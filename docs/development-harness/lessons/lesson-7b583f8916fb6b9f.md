---
schemaVersion: 1
recordType: lesson
id: lesson-7b583f8916fb6b9f
title: release-candidate-generation-order
topic: release candidate generation order
status: active
taskClasses:
  - architecture-review
paths:
  - packages/create-appraisejs
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-22c33f3e2d08882e
  - obs-94f9c21ef2623466
counterexampleRefs: []
evidence:
  - id: obs-22c33f3e2d08882e
    recordedAt: 2026-11-13T12:20:08.940Z
    summary: Concurrent root build and scaffold preparation omitted the late-generated Next type declaration from the first packed scaffold; sequential preparation restored the intended composition.
    evidenceSummary: M13 exact-candidate tarball comparison retained the first artifact and identified one missing generated declaration plus two regenerated clean seed databases.
    sourceType: host-observation
    sourceRef: M13-VERIFICATION
    polarity: neutral
    measurements: {}
  - id: obs-94f9c21ef2623466
    recordedAt: 2026-11-13T12:23:19.966Z
    summary: 'Lesson revalidated: M13 final scaffold comparison run-0Flx5w restores 1421 files; only clean seed databases differ from handoff.'
    evidenceSummary: M13 final scaffold comparison run-0Flx5w restores 1421 files; only clean seed databases differ from handoff.
    sourceType: lesson-revalidation
    sourceRef: lesson:lesson-7b583f8916fb6b9f
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-11-13T12:23:19.966Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: obs-94f9c21ef2623466
---

# release-candidate-generation-order

This advisory lesson applies to task classes: architecture-review.

## Portable evidence

- obs-22c33f3e2d08882e: Concurrent root build and scaffold preparation omitted the late-generated Next type declaration from the first packed scaffold; sequential preparation restored the intended composition. (M13 exact-candidate tarball comparison retained the first artifact and identified one missing generated declaration plus two regenerated clean seed databases.)
- obs-94f9c21ef2623466: Lesson revalidated: M13 final scaffold comparison run-0Flx5w restores 1421 files; only clean seed databases differ from handoff. (M13 final scaffold comparison run-0Flx5w restores 1421 files; only clean seed databases differ from handoff.)
