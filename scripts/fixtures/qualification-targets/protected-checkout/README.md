# Protected checkout runtime authentication qualification

`runtime-auth.mjs` supplies a disposable, same-origin automation login alongside the human Auth0 checkout fixture.
It is test-fixture code, not an Appraise authentication provider or a general session import API. The wrapper delegates
human requests to the unchanged hosted Auth0 handler. Automation sessions have their own cookie and identity; they
never acquire an MFA claim or reuse human Discovery cookies.

The operator supplies an exact HTTPS target origin, a randomly generated 32-byte base64url credential held only in
process memory, and an expiry no more than 90 minutes away. The credential is given to the Appraise server through a
process environment variable, e.g. `C27_AUTOMATION_PASSWORD`; persist only that reference in the selected Environment.
Never put the credential in CLI arguments, config files, authored steps, logs, screenshots, report feedback or evidence.
The wrapper retains a hash only in memory and exposes no secret through its status projection.

The managed scenario navigates to `/runtime-login`, fills `#runtime-credential` with the canonical
`browser.forms.fill.configured.credential@1` operation, submits the login form, submits the protected checkout and
asserts the result heading. The selected frozen Discovery inventory must include all login/checkout locators and ready
Step Definitions. Appraise's execution consent must explicitly contain `CREDENTIAL_USE` and bind the Environment
snapshot and exact prepared capsule. Every successor run needs fresh consent. Appraise starts each run in a fresh
context; the fixture issues a separate short-lived automation session after the password exchange.

Credential-bearing runs suppress Playwright traces. Failed-step screenshots still require inspection; the login input
is a password field and the deliberate first failure belongs after login and checkout, on the incorrect confirmation
assertion. Do not author a credential-value assertion or create an explicit screenshot of credential input.

Qualification requires a fresh human Auth0/MFA Discovery receipt in the same Journey, a live authenticated failed
managed run, full-report revision, approved bounded correction, fresh-consent passing successor, report review and
closure. Deterministic HTTP tests prove only fixture boundaries. The managed run authenticates an automation identity;
it does not prove headless Auth0 login or MFA. Prior expired targets and Discovery receipts cannot be reused.

Run the deterministic checks with:

```sh
node --test scripts/fixtures/qualification-targets/protected-checkout/runtime-auth.test.mjs
```

After the live window, revoke the wrapper, stop its listeners and tunnels, terminate the credential-bearing Appraise
process and remove the exact temporary Auth0 callback. Retain only sanitized non-secret receipts and artifact hashes.
