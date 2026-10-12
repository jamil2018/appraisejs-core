---
schemaVersion: 1
recordType: improvement-proposal
id: proposal-ada0b31f0b5b8e17
title: Retain exact browser qualification artifacts and concurrent traffic evidence
status: proposed
problem: Aggregate review digests cannot identify changed source files, and serial redirect tests can miss concurrent network traffic.
supportingRecords:
  - obs-892954586e523caa
suggestedChange: Record file paths, modes and hashes with review snapshots and use controlled overlapping browser requests in future qualification recipes.
expectedBenefit: Localize source drift and expose redirect attribution defects before exact artifact review.
effort: small
risks:
  - Advisory only; any policy or gate change requires explicit user guidance.
acceptanceMeasurements:
  - A future approved qualification records exact artifact identity and confirms the prerequisite before harness expansion.
taskClasses:
  - cross-module-feature
paths:
  - src/services/coordinator/quality-journey-discovery-browser-runtime.ts
supportingEvidence:
  - id: obs-892954586e523caa
    recordedAt: 2026-09-28T20:41:53.979Z
    summary: C2.3.3 review needed per-file artifact identity and concurrent redirect traffic coverage.
    evidenceSummary: An aggregate digest did not localize source drift; controlled overlapping image traffic exposed redirect predecessor attribution risk.
    sourceType: engineering-validation
    sourceRef: c233-artifact-continuity
    polarity: supports
    measurements: {}
lastResurfacedAt: null
reminderFingerprint: null
lastEvidenceAt: 2026-09-28T20:42:17.480Z
history:
  - at: 2026-09-28T20:42:17.480Z
    from: null
    to: proposed
    reason: Recorded as advisory backlog.
    revisitCondition: null
    authority: null
    evidence: null
---

# Retain exact browser qualification artifacts and concurrent traffic evidence

This is an advisory improvement backlog record. Its status never blocks unrelated task completion.

## Portable supporting evidence

- obs-892954586e523caa: C2.3.3 review needed per-file artifact identity and concurrent redirect traffic coverage. (An aggregate digest did not localize source drift; controlled overlapping image traffic exposed redirect predecessor attribution risk.)

## Retained original advisory note

# Advisory: retain file identities and exercise concurrent browser traffic

Status: proposed; no routing, permission, prompt, or quality-gate change is authorized by this note.

The 2026-09-23 C2.3.3 resume could verify the hosted fixture and operator from their file manifests, but the earlier
repository review retained only an aggregate digest. A changed checkout therefore required a fresh source review
without proof of which individual files had changed. Retain file paths, modes, and hashes alongside future aggregate
snapshots so source drift can be localized without claiming continuity from an aggregate alone.

The fresh review reproduced an ordinary concurrent image request being mistaken for a pending redirect successor.
Serial redirect tests had missed that interleaving. The repair added exact predecessor and network identity checks,
concurrent and adversarial unit cases, and a Chromium test that holds two redirect responses while independent image
traffic proceeds. Use controlled overlap when qualifying browser request sequencing; serial success is insufficient.

An initial native regression attempt used POST fetches that the existing fixture policy correctly rejected. The
test was changed to synthetic GET images, preserving production request policy. Inspect the terminal reason and actual
network contact before attributing an empty endpoint counter to the browser adapter.

Browser automatic approval review separately rejected a connection toggle and existing-tab reads because it believed
an unsaved security setting could be discarded. The operator stopped and requested user resolution; this observation
does not authorize a different automation surface or an approval bypass.

These are advisory workflow observations. Requested agent roles, context isolation, and sandbox enforcement remain
unverified without effective host receipts. Live authentication and C2.3.3 gate closure remain separate evidence.
