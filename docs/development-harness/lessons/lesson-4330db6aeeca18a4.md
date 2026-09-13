---
schemaVersion: 1
recordType: lesson
id: lesson-4330db6aeeca18a4
title: exact-artifact independent review
topic: exact artifact independent review
status: active
taskClasses:
  - cross-module-feature
paths:
  - scripts/lib/managed-journey-provider-qualification.mjs
  - scripts/tests/managed-journey-provider-qualification.test.mjs
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-b9c207590006ca98
counterexampleRefs: []
evidence:
  - id: obs-b9c207590006ca98
    recordedAt: 2026-09-10T17:15:13.917Z
    summary: Independent review reproduced a required-MCP authority-substitution bypass that deterministic fixtures missed, and exact-digest re-review accepted the repair.
    evidenceSummary: Initial digest 54927e94 was rejected; trusted server identity and origin binding plus a substitution regression produced accepted digest d906f597 with 20 tests passing.
    sourceType: host-agent-review
    sourceRef: route:ccd73fbc-5d84-4f4a-8d05-fc890666c0e1
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-09-10T17:15:13.917Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# exact-artifact independent review

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-b9c207590006ca98: Independent review reproduced a required-MCP authority-substitution bypass that deterministic fixtures missed, and exact-digest re-review accepted the repair. (Initial digest 54927e94 was rejected; trusted server identity and origin binding plus a substitution regression produced accepted digest d906f597 with 20 tests passing.)
