---
schemaVersion: 1
recordType: lesson
id: lesson-de7c6bd7f8b2b25e
title: 'coordination: Evolution trigger: avoidable-reroute'
topic: coordination evolution trigger avoidable reroute
status: stale
taskClasses:
  - architecture-review
  - cross-module-feature
paths: []
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-dd483d661f980f24
  - obs-4219ff7c2a40cdf6
counterexampleRefs: []
evidence:
  - id: obs-dd483d661f980f24
    recordedAt: 2026-09-08T14:37:32.895Z
    summary: 'Evolution trigger: avoidable-reroute'
    evidenceSummary: Phase 10 implementation and independent investigator review complete; local build, unit, browser, package, integrity and release checks passed. PR 278 CI tracked separately.
    sourceType: legacy-run-evolution
    sourceRef: run:5cae6680-081f-454e-92b3-24cb1e37ae81
    polarity: neutral
    measurements: {}
    observedAt: 2026-09-06T08:24:21.529Z
  - id: obs-4219ff7c2a40cdf6
    recordedAt: 2026-09-11T17:16:56.446Z
    observedAt: 2026-09-11T13:57:39.927Z
    summary: 'Evolution trigger: avoidable-reroute'
    evidenceSummary: Initial routing receipt used noncanonical signal names and selected executor; it was immediately superseded by investigator receipt 77d765f8-3996-4b95-bf9b-c531c1ddcc8c before experiment execution.
    sourceType: legacy-run-evolution
    sourceRef: run:947cbbb1-6a37-454b-bf00-0a7d4e36c85b
    polarity: neutral
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-06T08:24:21.529Z
lastResurfacedAt: null
reminderFingerprint: null
---

# coordination: Evolution trigger: avoidable-reroute

This advisory lesson applies to task classes: architecture-review, cross-module-feature.

## Portable evidence

- obs-dd483d661f980f24: Evolution trigger: avoidable-reroute (Phase 10 implementation and independent investigator review complete; local build, unit, browser, package, integrity and release checks passed. PR 278 CI tracked separately.)
- obs-4219ff7c2a40cdf6: Evolution trigger: avoidable-reroute (Initial routing receipt used noncanonical signal names and selected executor; it was immediately superseded by investigator receipt 77d765f8-3996-4b95-bf9b-c531c1ddcc8c before experiment execution.)
