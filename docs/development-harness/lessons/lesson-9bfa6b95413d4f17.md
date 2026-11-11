---
schemaVersion: 1
recordType: lesson
id: lesson-9bfa6b95413d4f17
title: canonical-role-ingress
topic: canonical role ingress
status: stale
taskClasses:
  - cross-module-feature
paths:
  - src/services/coordinator/quality-journey-triage-service.ts
harnessVersion: '1'
confidence: low
evidenceRefs:
  - obs-88f1931d11ce71cd
counterexampleRefs: []
evidence:
  - id: obs-88f1931d11ce71cd
    recordedAt: 2026-11-11T14:30:11.848Z
    summary: Scoped worker restrictions must share canonical transaction checks with direct versioned ingress.
    evidenceSummary: M10 direct-ingress and scoped-MCP tests reject forged report identity and stale lineage; independent review found an evidence-read transfer gap and regressions cover its repair.
    sourceType: deterministic-test
    sourceRef: M10-VERIFICATION
    polarity: neutral
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-11-11T14:30:11.848Z
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

# canonical-role-ingress

This advisory lesson applies to task classes: cross-module-feature.

## Portable evidence

- obs-88f1931d11ce71cd: Scoped worker restrictions must share canonical transaction checks with direct versioned ingress. (M10 direct-ingress and scoped-MCP tests reject forged report identity and stale lineage; independent review found an evidence-read transfer gap and regressions cover its repair.)
