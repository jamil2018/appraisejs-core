# Slice 06: Execution Consent And Managed Run

Add project-configurable `ALWAYS_ASK`, `RISK_AWARE`, and `TRUSTED_AGENT` policies, defaulting to `ALWAYS_ASK`.
Consent is separate from credential authorization and binds the exact execution manifest.

Acceptance:

- Agents may request stricter one-run behavior but cannot lower project policy.
- New credentials, permission escalation, purchases, account creation, destructive actions, undeclared effects, and
  manifest drift always require explicit consent.
- Consent is consumed atomically with durable run creation and invalidated by any manifest change.
