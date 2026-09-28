---
schemaVersion: 1
recordType: improvement-proposal
id: proposal-1509dbeb268aa998
title: Qualify browser containment independently of observer timing
status: proposed
problem: Immediate observer-triggered teardown can make a network leak appear contained; protocol header visibility can be mistaken for browser enforcement.
supportingRecords:
  - obs-ea1683d1d54ef13a
suggestedChange: Consider a bounded adversarial qualification recipe that delays observers, recovers native constructors, distinguishes script fetching from worker execution, and correlates lifecycle events with loader identity.
expectedBenefit: Expose false-positive containment claims before exact-artifact review.
effort: small
risks:
  - Advisory only; recipe or gate changes require explicit guidance.
acceptanceMeasurements:
  - A future approved recipe detects the retained negative examples and passes the repaired fixture without changing policy.
taskClasses:
  - cross-module-feature
paths:
  - src/services/coordinator/
supportingEvidence:
  - id: obs-ea1683d1d54ef13a
    recordedAt: 2026-09-19T09:15:31.522Z
    summary: Delayed observation and recovered constructors exposed false containment evidence.
    evidenceSummary: Synthetic native Chromium checks found a native WebSocket prototype escape and a delayed handshake despite URL blocking; deny-only constructor and delayed observers passed both modes. Browser-provided worker target pause, not injected CSP header appearance, establishes execution containment. Runtime fault tests exposed seed wait and early lifecycle races.
    sourceType: engineering-validation
    sourceRef: c233-production-adapter
    polarity: neutral
    measurements: {}
lastResurfacedAt: null
reminderFingerprint: null
lastEvidenceAt: 2026-09-19T09:15:41.506Z
history:
  - at: 2026-09-19T09:15:41.506Z
    from: null
    to: proposed
    reason: Recorded as advisory backlog.
    revisitCondition: null
    authority: null
    evidence: null
---

# Qualify browser containment independently of observer timing

This is an advisory improvement backlog record. Its status never blocks unrelated task completion.

## Portable supporting evidence

- obs-ea1683d1d54ef13a: Delayed observation and recovered constructors exposed false containment evidence. (Synthetic native Chromium checks found a native WebSocket prototype escape and a delayed handshake despite URL blocking; deny-only constructor and delayed observers passed both modes. Browser-provided worker target pause, not injected CSP header appearance, establishes execution containment. Runtime fault tests exposed seed wait and early lifecycle races.)
