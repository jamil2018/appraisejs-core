---
schemaVersion: 1
recordType: lesson
id: lesson-0041bc6564f3beef
title: Scoped child root must match the generated supervisor configuration
topic: scoped child root binding
status: active
taskClasses:
  - architecture-review
paths:
  - scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r51
harnessVersion: '1'
confidence: medium
evidenceRefs:
  - obs-0041bc6564f3beef
counterexampleRefs: []
evidence:
  - id: obs-0041bc6564f3beef
    recordedAt: 2026-10-18T18:09:28.513525+00:00
    observedAt: 2026-10-18T18:09:28.513525+00:00
    summary: Actual child entry refuses the generated root when a copied literal is stale
    evidenceSummary: Offline actual child entry reproduced a stale root refusal; the manifest root and worker allowed root differed, and no external effects were attempted. This reproduction does not establish the rejected native protocol predicate or native failure cause; historical cleanup remains UNKNOWN.
    sourceType: repository-observation
    sourceRef: .appraisejs/m02-r48-scoped-root-reproduction-02.json
    polarity: supports
    measurements: {}
ambiguousObservationRefs: []
lastValidatedAt: 2026-10-18T18:09:28.513525+00:00
lastResurfacedAt: null
reminderFingerprint: null
revalidationEvidenceRef: null
---

Use the same fixed reviewed policy root in the supervisor and scoped worker. Offline manifest serialization and historical verification do not establish child startup compatibility. Inspect the actual generated child path before further regression coverage. A confirmed configuration defect does not identify an unretained native response predicate.

Keep requested role/context separate from effective host proof. The scored swarm record refused unverified independent context evidence; no host attestation or passing harness score was fabricated. This advisory record changes no routing policy, permissions or quality gate.
