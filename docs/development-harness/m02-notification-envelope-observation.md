# M02 notification envelope observation

Date: 2026-10-16. Advisory finding only; no routing, model, permission, concurrency or gate policy changed.

The R7 85-method inventory and method-payload fixtures passed offline, but a single native attempt stopped at its strict advisory envelope check. The pinned schema permits optional top-level emittedAtMs on every notification, while the adapter permitted it only in the provider-error path. Synthetic timestamped notifications reproduce that gap; retained native evidence does not establish the actual method or field.

Future protocol compatibility checks should exercise complete envelopes as well as method parameters, including schema-level optional metadata across method families. A single pure envelope predicate can prevent handlers from silently accepting different transport contracts while leaving authority-specific payload checks intact. Optional telemetry must not become readiness, identity, deadline or effect authority. Failure receipts should record fixed shape categories and method hashes before fencing, without raw payload retention.

Open Design and t3code were useful primary-source integration references because they separate notification routing from request correlation. Their broad tolerance of unhandled notifications is not an authorization rule for this bounded campaign. Consult those architectures when further agent integration issues arise, as directed by the user. No upstream runtime or provider test was run for this observation.

Preserve consumed commands, pending intents and UNKNOWN evidence. A source-backed correction receives its own bounded decision, tests and exact review; it is not an automatic replay. Keep review effort focused on changed contracts and exact current bytes, rather than repeating completed historical lanes.
