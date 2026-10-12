# AppraiseJS

This generated app stores authored tests and Quality Journeys locally in SQLite. Node.js 20.19 or later is required.

Run `npm run setup` for first setup: install dependencies, create local configuration, generate the Prisma client,
apply guarded migrations, seed canonical Step Definitions, build the app and protect seeded files. Then run
`npm run start`. Use `npm run dev` for local development. Setup upgrades storage; it does not reset user data.
Install desired browsers with `npm run install-playwright -- chromium` before browser execution.

## Journey operation

Use the Journey UI to confirm the immutable requirement and target, prepare the bounded Codex handoff, and explicitly
send the prefilled composer. Local targets use their validated workspace; remote targets use neutral host context
and retain the remote URL identity. Copy the prompt manually if the URI handler is absent or denied. Connection
requires authenticated ticket redemption against the exact Journey and target; opening Codex grants no assignment.
Expired or superseded tickets require a new handoff. Read current Journey state before claiming work.

Install the separate `appraisejs` CLI/MCP package and follow **Agent setup** for authenticated MCP registration and
plugin diagnostics. Unknown host versions or stale task schemas require capability checks and explicit reconnect.
Do not treat a plugin version, tool list or successful launch as observed task liveness or exact schema capture.
The **Last checked** time measures a successful status observation, not Codex activity. Silence means unknown.

Analysis answers, scenario review/revision, execution consent, remediation, report review and closure remain human
decisions in Appraise. Discovery starts anonymously; authenticated discovery needs the qualified Appraise browser
and human sign-in/MFA. Credentials never go into prompts or artifacts. Execution uses the consent-bound runtime
capsule and sealed evidence; independent TestRuns and agent prose cannot satisfy Journey gates.

## Recovery and upgrades

Back up SQLite before upgrades. `npm run migrate-db` validates migration inventory and stored migration history
before deploying the matching application. Missing/changed migration files, future history or ambiguous migration
records refuse access. Restore matching application files; do not regenerate inventory to hide installation damage,
reset the DB, edit migration history or invoke bare Prisma to bypass refusal. Unknown/newer storage refuses supported
downgrade. Direct DB access, arbitrary older binaries and concerted code/inventory replacement remain outside this guard.

After a lost reply or restart, reread durable outcomes and reconcile the same assignment/cycle before retrying an
effect. Human waits retain blockers; reconnect never fabricates approval or renews a lease. A fresh handoff/takeover
requires current state and Appraise approval, and fences the predecessor. Target changes require explicit rebinding
or refusal while preserving historical evidence.

Use **Pause journey** to fence admissions and reconcile owned execution/browser cleanup. `CANCELLING` is not terminal:
output completion, a valid live-supervisor stop receipt and browser-close acknowledgement must join. Lost private
ownership or ambiguous effects remain blocked for manual investigation. Never signal persisted PIDs/PGIDs, infer
cleanup from an empty local map, or erase historical evidence. Appraise does not attest external Codex stop or background wake.

`appraisejs agent disconnect --cwd <hub> --json` revokes hub access without deleting data. Appraise plugin uninstall
revokes before removing guidance; raw Codex plugin removal alone does not. Already admitted work still needs pause
and reconciliation. Intentional reconnect rotates credentials: `appraisejs agent reconnect --cwd <hub> --json`,
reconfigure transport using `agent setup --json`, reconnect/start a fresh task, diagnose and reread authoritative state.
Previous credentials stay rejected; ownership and approvals remain unchanged.

These operational controls are not a release qualification or host-isolation attestation. Consult the installation's
current diagnostics and retained evidence before making a deployment decision.
