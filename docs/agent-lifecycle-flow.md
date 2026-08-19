# Quality Lifecycle Flow

AppraiseJS manages quality work within an explicit target-project boundary. The caller supplies the target workspace during diagnostic and registration; a selected UI project, URL parameter, cookie, or arbitrary identifier cannot replace that binding.

## Quality Design

The quality workflow begins by registering a target and supplying a requirements source. AppraiseJS analyzes the source into a requirement graph. Human approval fixes the requirement revision that a Quality Plan may reference.

A Quality Plan revision defines obligations and the validation designs that realize them. Validation designs are proposed, reviewed, compiled, and published against their immutable requirement identities. Published validations contain the exact executable inputs used by managed runtime capsules.

Validation compilation canonicalizes the reviewed projection into the strict runtime envelope: scenario-only Gherkin documents, exact Step Invocation closure, compiler and extension-policy hashes, and publication provenance. Publication also materializes the reviewed module, suite, case, step, locator-group, and locator identities required by TestRun foreign keys; runtime preparation idempotently repairs that relational execution index for an already-published version.

For an approved revision, `assessment_prepare_run` may perform the mechanical prepare-and-start sequence from compact exact bindings. Its durable receipt is target-scoped and resumable by idempotency key; each replay repairs built-in Step Definition readiness, re-reads committed realization/publication state, and resumes only incomplete mutations. It stops before evidence reconciliation, evidence review, and Assessment decision; those remain separate Appraise-owned gates.

Preparation synchronizes the reversible built-in registry first, then completes a read-only, hash-bound preflight of the approved validation set, exact Step References, typed inputs, and target-owned locators before it creates a preparation record or mutates environments, publications, Assessments, or TestRuns. Summary responses include the compact preflight counts and hashes; callers should request full payloads only for bounded diagnostics.

Runtime publication seals the canonical Step Reference hash for each invocation. Runtime closure resolution accepts only that exact canonical hash; persisted definition-row hashes are publication metadata and are never invocation authority.

## Assessment

An Assessment identifies an immutable evaluation subject and the published validation matrix to run. Readiness verifies target binding, published validation, subject identity, matrix coverage, and current requirement alignment before any execution starts.

Assessment execution prepares and starts content-bound managed runs. Replays with the same content identity are idempotent. Reconciliation waits for terminal runs, checks capsule and artifact integrity, and seals an immutable Evidence Receipt for each completed matrix cell. Partial evidence remains visible and is never discarded merely because another cell is still active or failed.

Human-verification CAPTCHA blocks are terminal managed-run boundaries, not target failures or cancellations. A high-confidence, structure-only runtime event can seal an integrity-valid `EvidenceOutcome.BLOCKED` receipt, but it leaves `targetOutcome` as `not_evaluated`, prevents a pass/fail decision, and returns the Assessment to `READY` for a fresh run after the challenge is resolved outside AppraiseJS. No Appraise lifecycle API may bypass, pause, resume, or take over that browser session.

Evidence reaches review only after the Assessment has completed reconciliation. A decision is hash-bound to the complete evidence set and current requirement alignment. Stale inputs are rejected. Standalone evidence execution may seal receipts but cannot create an Assessment decision.

An Assessment is never reopened. `assessment_create_successor` creates a distinct `READY` generation in the same immutable lineage only from `DECIDED`, `STALE`, `CANCELLED`, or an `EVIDENCE_REVIEW` Assessment with an explicit retry reason. The successor keeps the exact target, plan, and revision, but has no inherited runs, evidence receipts, or decision. It may use the same immutable subject or an explicitly supplied new subject descriptor; the predecessor remains unchanged in either case.

## Recovery And Ownership

## Credential-bearing execution authorization

Credential-free Assessment execution remains unchanged. A run whose selected environment has a configured credential reference requires a one-use authorization grant bound to the exact target, Assessment, Quality Plan/revision, immutable subject, publication/runtime fingerprints, environment, credential-binding references, and execution request hash. The grant is consumed atomically with durable `AssessmentRun` intent creation; lifecycle/readiness denial never consumes it, while a later redacted secret-resolution failure does.

Two non-interchangeable issuers exist: a same-origin Appraise UI session, explicitly labelled **unauthenticated local possession**, and a verified host assertion. UI issuance is deliberately absent from MCP. Host issuance accepts only compact Ed25519 JWS assertions verified with `APPRAISE_HOST_ASSERTION_TRUST_FILE`; unavailable or malformed trust configuration fails closed as `HOST_ASSERTION_UNAVAILABLE` and never falls back to UI authority. Values, value hashes, session values, JWS bytes, and trust contents are never persisted or included in routine responses.

Host trust is an exact JSON object: `{ "version": 1, "audience": string, "clockSkewSeconds"?: integer 0..300, "maxAssertionLifetimeSeconds"?: integer 1..3600, "keys": [...] }`. Each key is an exact object with `issuer`, `kid`, `validFrom`, `signingEndsAt`, `verificationEndsAt`, optional `revokedAt`, and `publicKeyJwk`. Dates are finite ISO-8601 UTC instants ordered `validFrom <= signingEndsAt <= verificationEndsAt`; a revoked key is not accepted at or after `revokedAt`. `publicKeyJwk` is exactly `{ "kty": "OKP", "crv": "Ed25519", "x": string }`; Ed448 and additional JWK members are rejected.

The compact JWS has exactly three segments, header `{ "alg": "EdDSA", "kid": string, "typ": "appraise-credential-execution+jwt" }`, and payload `{ "iss", "sub", "aud", "iat", "nbf", "exp", "jti", "authorization" }`. `iat`, `nbf`, and `exp` are finite integral NumericDates, use the configured bounded skew/lifetime, and are checked against the selected key's signing/verification windows. The authorization object is exact and binds `requestId`, `requestHash`, `targetProjectId`, `assessmentId`, `qualityPlanId`, `qualityPlanRevisionId`, `subjectRevisionId`, `environmentId`, `publicationFingerprint`, `runtimeInputHash`, and `credentialBindings`. Each binding is exactly `{ "slot": string, "ref": string }`; malformed, duplicate, or extra bindings invalidate the assertion rather than being discarded. A `(issuer, jti)` replay returns only the originally issued grant when its assertion hash matches; any different replay conflicts. Rotate by adding a new key window before ending the old signing window, then retain the old key through verification expiry; set `revokedAt` for emergency revocation.

The UI shows the durable request/grant summary only to the exact validated local session that issued an active local grant; it never displays host-issued or another session's grant. It can copy the bounded execution handoff `{ executionRequestId, authorizationGrantId, expectedRequestHash }`. That tuple is a one-use bearer capability for this exact execution scope, so it must be handed only to the intended execution worker and not logged or shared. UI revocation is limited to the issuing local session. The host revoke operation is limited to `HOST_ASSERTION` grants. Generic revocation always requires its expected issuer kind.

Only AppraiseJS services transition Quality Plan, Assessment, execution, evidence, and decision state. Chat messages describe intent but are not approval evidence. If source, requirements, validation, subject, or evidence identities change, create or review the newly derived immutable revision rather than mutating a historical receipt.

Use the Quality Plans and Assessments surfaces for human review. The exact available MCP operations, resources, and safety annotations are generated from the executable contract; do not infer unavailable operations from historical documentation.
