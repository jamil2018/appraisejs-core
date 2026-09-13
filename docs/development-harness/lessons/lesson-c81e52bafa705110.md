---
schemaVersion: 1
recordType: lesson
id: lesson-c81e52bafa705110
title: 'routing: routing quality scored 1/2'
topic: routing routing quality scored 1 2
status: stale
taskClasses:
  - architecture-review
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
  - obs-54a2564819cf31a6
  - obs-fad6bc15a7273af7
  - obs-72563cdc91db04fc
  - obs-6b0f99757a902361
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
  - id: obs-54a2564819cf31a6
    recordedAt: 2026-09-11T17:16:56.365Z
    observedAt: 2026-09-09T14:59:17.696Z
    summary: routing quality scored 1/2
    evidenceSummary: All implementation phases reached deterministic validation and independent PASS at bacd4668; adversarial judges exposed and closed crash, fencing, ordinary-untracked, and ignored-untracked cleanup gaps.
    sourceType: legacy-run-evolution
    sourceRef: run:6565b01f-6f98-4bd3-9abd-6fcb3fe51c09
    polarity: neutral
    measurements: {}
  - id: obs-fad6bc15a7273af7
    recordedAt: 2026-09-11T17:16:56.438Z
    observedAt: 2026-09-11T13:57:39.927Z
    summary: routing quality scored 1/2
    evidenceSummary: Initial routing receipt used noncanonical signal names and selected executor; it was immediately superseded by investigator receipt 77d765f8-3996-4b95-bf9b-c531c1ddcc8c before experiment execution.
    sourceType: legacy-run-evolution
    sourceRef: run:947cbbb1-6a37-454b-bf00-0a7d4e36c85b
    polarity: neutral
    measurements: {}
  - id: obs-72563cdc91db04fc
    recordedAt: 2026-09-11T17:16:56.458Z
    observedAt: 2026-09-11T14:26:30.482Z
    summary: routing quality scored 1/2
    evidenceSummary: Read current candidate evidence, canonical gateway and dynamic fixture, and official App Server docs. Exploratory alternatives only; no gate changes or qualification claims. Corrected initial routing receipt with unsupported input keys.
    sourceType: legacy-run-evolution
    sourceRef: run:61d60b76-b947-4248-af6c-7df7ce9411fd
    polarity: neutral
    measurements: {}
  - id: obs-6b0f99757a902361
    recordedAt: 2026-09-11T17:16:56.478Z
    observedAt: 2026-09-11T17:16:49.576Z
    summary: routing quality scored 1/2
    evidenceSummary: 17 handoff tests pass; MCP recovered; desktop observation denied; live matrix pending
    sourceType: legacy-run-evolution
    sourceRef: run:17b47a64-00c0-4245-b922-03920d3a8125
    polarity: neutral
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-06T17:33:50.830Z
lastResurfacedAt: null
reminderFingerprint: null
---

# routing: routing quality scored 1/2

This advisory lesson applies to task classes: architecture-review, cross-module-feature, release-gate.

## Portable evidence

- obs-0772a7c624eb138d: routing quality scored 1/2 (PR #266 targets appraise-0.5 at 6ed41673; all nine checks passed; branch clean and mergeable.)
- obs-12d73c8190585c6d: routing quality scored 1/2 (Phase 06 final patch independently approved after deterministic tests, migration rehearsal, certification, build, scaffold sync, and quality gates.)
- obs-60ce7b386194c40c: routing quality scored 1/2 (Phase 10 implementation and independent investigator review complete; local build, unit, browser, package, integrity and release checks passed. PR 278 CI tracked separately.)
- obs-1fcd5217fd02d077: routing quality scored 1/2 (Two independent audits found handoff defects; 19 focused tests, 73 scaffold tests, package TypeScript, production build, template parity, and final independent READY verdict.)
- obs-54a2564819cf31a6: routing quality scored 1/2 (All implementation phases reached deterministic validation and independent PASS at bacd4668; adversarial judges exposed and closed crash, fencing, ordinary-untracked, and ignored-untracked cleanup gaps.)
- obs-fad6bc15a7273af7: routing quality scored 1/2 (Initial routing receipt used noncanonical signal names and selected executor; it was immediately superseded by investigator receipt 77d765f8-3996-4b95-bf9b-c531c1ddcc8c before experiment execution.)
- obs-72563cdc91db04fc: routing quality scored 1/2 (Read current candidate evidence, canonical gateway and dynamic fixture, and official App Server docs. Exploratory alternatives only; no gate changes or qualification claims. Corrected initial routing receipt with unsupported input keys.)
- obs-6b0f99757a902361: routing quality scored 1/2 (17 handoff tests pass; MCP recovered; desktop observation denied; live matrix pending)
