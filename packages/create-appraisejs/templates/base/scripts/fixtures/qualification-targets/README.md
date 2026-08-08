# Runtime qualification targets

- `passing-editor-spa` serves a loopback editor-style SPA and verifies its saved state.
- `expected-product-failure` serves the same application shape with an actual unsaved editor state; its verifier exits non-zero when the product assertion expects `saved`.
- `infrastructure-interruption` is a long-running target process whose verifier sends `SIGTERM` and observes the interruption signal.

These targets deliberately separate a successful product result, an expected product assertion failure, and a process interruption. None turns a target outcome into a coordinator API error.
