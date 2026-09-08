---
schemaVersion: 1
recordType: lesson
id: lesson-c81e52bafa705110
title: 'routing: routing quality scored 1/2'
topic: routing routing quality scored 1 2
status: stale
taskClasses:
  - cross-module-feature
  - release-gate
paths: []
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-0772a7c624eb138d
  - obs-12d73c8190585c6d
  - obs-60ce7b386194c40c
  - obs-1fcd5217fd02d077
counterexampleRefs: []
evidence:
  - id: obs-0772a7c624eb138d
    recordedAt: 2026-09-08T14:37:32.790Z
    summary: routing quality scored 1/2
    evidenceSummary: 'PR #266 targets appraise-0.5 at 6ed41673; all nine checks passed; branch clean and mergeable.'
    sourceType: legacy-run-evolution
    sourceRef: run:32c51be5-b67e-4e46-9a97-8e282977eab5
    polarity: neutral
    measurements: {}
    observedAt: 2026-08-28T15:44:14.607Z
  - id: obs-12d73c8190585c6d
    recordedAt: 2026-09-08T14:37:32.851Z
    summary: routing quality scored 1/2
    evidenceSummary: Phase 06 final patch independently approved after deterministic tests, migration rehearsal, certification, build, scaffold sync, and quality gates.
    sourceType: legacy-run-evolution
    sourceRef: run:1d180d2d-1124-4894-9c96-02153595a029
    polarity: neutral
    measurements: {}
    observedAt: 2026-09-04T20:59:32.143Z
  - id: obs-60ce7b386194c40c
    recordedAt: 2026-09-08T14:37:32.887Z
    summary: routing quality scored 1/2
    evidenceSummary: Phase 10 implementation and independent investigator review complete; local build, unit, browser, package, integrity and release checks passed. PR 278 CI tracked separately.
    sourceType: legacy-run-evolution
    sourceRef: run:5cae6680-081f-454e-92b3-24cb1e37ae81
    polarity: neutral
    measurements: {}
    observedAt: 2026-09-06T08:24:21.529Z
  - id: obs-1fcd5217fd02d077
    recordedAt: 2026-09-08T14:37:32.935Z
    summary: routing quality scored 1/2
    evidenceSummary: Two independent audits found handoff defects; 19 focused tests, 73 scaffold tests, package TypeScript, production build, template parity, and final independent READY verdict.
    sourceType: legacy-run-evolution
    sourceRef: run:68720cee-6a5c-4c59-bf22-64af19ecfa65
    polarity: neutral
    measurements: {}
    observedAt: 2026-09-06T17:33:50.830Z
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-06T17:33:50.830Z
lastResurfacedAt: null
reminderFingerprint: null
---

# routing: routing quality scored 1/2

This advisory lesson applies to task classes: cross-module-feature, release-gate.

## Portable evidence

- obs-0772a7c624eb138d: routing quality scored 1/2 (PR #266 targets appraise-0.5 at 6ed41673; all nine checks passed; branch clean and mergeable.)
- obs-12d73c8190585c6d: routing quality scored 1/2 (Phase 06 final patch independently approved after deterministic tests, migration rehearsal, certification, build, scaffold sync, and quality gates.)
- obs-60ce7b386194c40c: routing quality scored 1/2 (Phase 10 implementation and independent investigator review complete; local build, unit, browser, package, integrity and release checks passed. PR 278 CI tracked separately.)
- obs-1fcd5217fd02d077: routing quality scored 1/2 (Two independent audits found handoff defects; 19 focused tests, 73 scaffold tests, package TypeScript, production build, template parity, and final independent READY verdict.)
