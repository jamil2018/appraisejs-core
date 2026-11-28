# AppraiseJS

This generated app stores authored tests and Quality Journeys locally in SQLite. Node.js 20.19 or later is required.

Run `npm run setup` for first setup: install dependencies, create local configuration, generate the Prisma client,
apply guarded migrations, seed canonical Step Definitions, build the app and protect seeded files. Then run
`npm run start`. Use `npm run dev` for local development. Setup upgrades storage; it does not reset user data.
Install desired browsers with `npm run install-playwright -- chromium` before browser execution.

## Provider setup and Journey operation

Open **Settings → Agent setup** in the running app to connect a provider for reviewed project-chat lookups. ChatGPT
uses browser consent and private OS credential storage on macOS or Linux; Linux needs desktop Secret Service and
`secret-tool`. Claude Code requires a verified, digest-pinned official executable and its own sign-in on a supported
Mac. Cursor requires a pinned official CLI bundle and its own sign-in on a supported Mac. Settings reports unavailable
providers and connection failures without making another provider a prerequisite. A saved lookup still needs its own
review before sending it to the selected provider. Native Codex lookups require a configured, verified macOS
app-server executable and a connected ChatGPT account.

For a managed Quality Journey on a supported Mac, choose the installed **Managed worker** on the Journey brief.
The saved worker choice is separate from the project-chat lookup provider. Appraise manages eligible role work and
waits at its own review and execution-consent gates; installing a CLI or opening its sign-in screen does not start a
Journey. Read the current Journey stage and blockers before acting.

The separate `appraisejs` CLI/MCP package remains available for authenticated external coordinator assignments and
manual work. Follow **Agent setup** for MCP registration and Codex plugin diagnostics, then use the project
diagnostic on the intended hub and target. Existing external assignments require their versioned claim, admission,
and outcome checks; they do not use the retired desktop Journey ticket handoff. Unknown host versions or stale task
schemas require capability checks and explicit reconnect. A plugin version, tool list, or successful launch does not
prove task liveness, exact schema capture, or lifecycle authority. **Last checked** records a successful status
observation, not agent activity; silence means unknown.

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
effect. Human waits retain blockers; reconnect never fabricates approval or renews a lease. An explicit hosting
transfer requires current state, quiescence, and Appraise approval before it fences the predecessor. Target changes
require explicit rebinding or refusal while preserving historical evidence.

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
