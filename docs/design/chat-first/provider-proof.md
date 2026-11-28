# Fresh-install provider proof

## Current evidence

Appraise has internal Codex provider intent, process supervision, and recovery building blocks for Quality Journeys.
M13 evidence covers specific native observations and leaves historical provider outcomes unresolved. Appraise's current
Journey setup exposes a Codex diagnostic and Settings links to it. **Settings → Agent setup → Connect ChatGPT**
prepares an expiring loopback authorization for a local macOS or Linux installation. Appraise verifies the signed
account identity and granted scopes before storing credentials. Appraise encrypts ChatGPT tokens with AES-256-GCM
and keeps the encryption key in macOS Keychain or Linux Secret Service. Linux requires the desktop Secret Service
and the `secret-tool` client. Node 20 hosts also need the SQLite command-line tool for cross-process locking.
Existing account records are encrypted in place when Appraise opens them. If the
vault is unavailable, Appraise leaves the original record in place and refuses to use it. Earlier backups may
still contain copies of the former plaintext records. Local disconnect removes the account's local credential
record. Synthetic tests exercise the callback, credential storage, and migration.
Saved chats offer local lookup, ChatGPT Responses, and native Codex on a configured macOS host. ChatGPT receives
the record type and search terms after the user reviews them. Appraise checks the account's model catalog before
inference. The direct Responses route makes one stateless, streamed request with one Appraise read function.
Matching records stay in Appraise. Local chat uses the same project-scoped reader.
The accepted attempt and its result survive restart. An interrupted attempt remains unresolved and blocks switching
until the user acknowledges that exact attempt. Its saved message cannot start another provider attempt.

The native route starts one ephemeral Codex app-server per saved lookup. macOS Seatbelt limits the subprocess to
its private scratch directory, system resources, and the per-attempt loopback broker. The subprocess gets a random
broker capability. Appraise keeps the account credential, forwards the reviewed query with one namespaced tool,
and follows the verified tool call with a fixed acknowledgement and any reasoning history from the provider's
first response. A result requires Appraise's local read and a confirmed native turn completion. The managed
Journey worker follows its own opt-in and session contract. Historical attempts keep their recorded outcomes.
[Hosting and sessions](../../quality-journey-host-sessions.md) ·
[Provider intent](../../quality-journey-provider-intents.md) ·
[M13 evidence](../../../tasks/codex-app-server-journeys/M13-INTEGRATED-IMPLEMENTATION.md)

In the disposable macOS preview, a signed-in ChatGPT plan account completed a fresh saved lookup through the app
and returned the exact project-scoped case, **Guest checkout returns an order number**. A browser reload preserved
both the completed lookup and the earlier failed attempt. The earlier attempt stopped at the model catalog size limit.
The live catalog measured 850,543 decoded bytes, so the catalog now has its own 4 MiB limit. The Responses stream
omitted `Content-Type`; Appraise checks the event body directly in that case and requires a valid terminal event
with exactly the allowed function call. The inference stream keeps its separate 256 KiB limit.

The same disposable preview database was upgraded to migration 101 and opened in a separate macOS 27.2.1 preview.
The official installed Codex app-server 0.166.0 completed a fresh lookup through **Review Codex lookup** and
**Send lookup to Codex**. The Appraise UI and SQLite agreed on one project-scoped match, **Guest checkout returns
an order number**. Reload preserved the native completion and the earlier failed and completed Responses attempts.
The installed binary also completed an offline two-round tool fixture with one Appraise read. Seatbelt canaries
allowed only the assigned broker port and denied an outside file read, alternate and self process spawning, and a
sibling localhost port. The UI test used Playwright because the in-app browser host was unavailable.

## Enable native Codex lookups on macOS

Set `APPRAISE_CODEX_READ_EXECUTABLE` to the canonical absolute path of a trusted, installed `codex` executable.
Set `APPRAISE_CODEX_READ_SHA256` to its verified lowercase SHA-256 digest and restart Appraise. The preview uses
Codex app-server 0.166.0 with the `gpt-6.1-sol` model listed for the signed-in ChatGPT account. Reverify the binary
and update the configured digest when upgrading. Connect ChatGPT in Settings, open a saved project conversation,
and select **Use native Codex for lookups**. Save a fresh lookup message and review the search before sending it.
The preview keeps earlier attempts attached to their original messages and engines.

## Enable Claude Code on macOS

Confirm coverage under [Anthropic's terms for running Claude Code in your product](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).
Use [Anthropic's native release verification instructions](https://code.claude.com/docs/en/setup) to verify an
unmodified macOS binary that supports `--safe-mode` and structured print output. Set
`APPRAISE_CLAUDE_CODE_EXECUTABLE` to its absolute path and `APPRAISE_CLAUDE_CODE_SHA256` to the lowercase digest
from the verified release manifest. Reverify and update the pin when upgrading. Appraise checks the installed image
before starting Claude Code and leaves the provider unavailable without this configuration.

In **Settings → Agent setup**, select **Connect Claude Code** and complete Anthropic's sign-in as prompted.
Claude Code manages sign-in and sign-out through its own commands, using a private `CLAUDE_CONFIG_DIR` under the
current OS user's home. Appraise requires macOS Keychain and blocks Claude Code's plaintext credential-file
fallback during sign-in and lookups. If Settings identifies a legacy plaintext profile, use **Disconnect locally**
to clear that sign-in before reconnecting. The local Appraise
installation should run on loopback and under that user account.

In a project chat, choose **Use Claude Code for lookups**, save a lookup, and review its record type and search
text. Appraise checks that the CLI reports a recognized Claude subscription before starting the lookup and rechecks
that session immediately before launch. The restricted print-mode process receives only those reviewed fields. Its loopback HTTPS relay limits
egress to the documented Anthropic API and token refresh hosts. A successful structured result must request the
one fixed action before Appraise searches the active project. Appraise keeps the resulting records locally and
saves the attempt as `CLAUDE_CODE`.

Managed Journeys use the same verified executable and connected official CLI profile. Enable that path with
`APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED=true` and select Claude Code on the Journey brief. Appraise binds each
role attempt to its original provider, executable and account. The CLI returns one structured proposal and
Appraise validates it through the existing role gateway. Journey reviews, execution consent, and run evidence
stay in Appraise. The live evidence below covers saved project lookups.
[Quality Journey operator guide](../../quality-journey-operator-guide.md#start-a-local-server-with-managed-workers).

An offline rehearsal on a fresh Next.js 16.4.6 scaffold applied all 102 migrations. A synthetic CLI exercised
Settings connect and disconnect, the reviewed checkout lookup, project isolation, and result persistence after
reload. The pinned Claude Code 2.1.332 binary reported the isolated profile as disconnected and loaded inside
the lookup sandbox.

On macOS 27.2.1, a user signed in through Claude Code 2.1.332 with their own Claude subscription. The lookup
sandbox needed Claude Code's private temp override, read access to the macOS login Keychain, and access to system
timezone data during TLS startup. An offline TLS fixture confirmed the CLI still rejected an untrusted certificate.
Separate launcher fixtures confirmed that macOS denied file reads and writes outside the allowed paths, an
unrelated subprocess, and a sibling loopback listener. The relay rejected an unlisted destination.
The corrected launcher completed a fresh Appraise checkout lookup and returned exactly **Guest checkout returns
an order number**. The result persisted after reload and the other project's matching checkout case stayed out of
the result. The two earlier unresolved attempts retained their recorded state.

After reconnecting the official Claude Code profile, R5 completed a fresh reviewed lookup and retained the
same result after reopening. In a different disposable project, Claude Code completed the managed Analysis,
Scout, and Resource Explorer roles. Scenario Designer's dispatch stopped at output validation without a usable
structured proposal. Appraise preserved its UNKNOWN attempt before canonical submission. None of this Journey's
work reached scenario approval, execution permission, or the runner. Claude Code may complete a command without
the `structured_output` field. Appraise requires that field for the schema-bound roles and continues to validate
the proposal in the canonical services. [Claude Code structured output](https://code.claude.com/docs/en/headless#get-structured-output)

The same macOS R6 Turbopack build `8TUe4ZeRbzIjQ3XDc1w7w` completed fresh reviewed lookups with ChatGPT
Responses, Claude Code `2.1.332`, and Cursor CLI `2026.11.22-e9042b2`. Each lookup returned the selected project's
case and excluded the other project's decoy. Reopening showed the original completed attempt. ChatGPT completed
after renewed sign-in. A separate Claude Journey reached approved scenarios, then Appraise rejected a preparation
proposal that omitted one of the two approved scenarios. The original Automator attempt is preserved as UNKNOWN.

For Claude-managed automation, Appraise now requires one structured response key for each approved scenario.
After checking the key set, Appraise converts the proposal to the same canonical array used for validation,
submission, and recovery. A separate synthetic probe through the pinned CLI supplied two approved scenarios.
Both returned in the structured response and passed canonical preflight. The probe ended before publication or
execution. [Claude structured-output limits](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#schema-complexity-limits)

On final macOS build `y31SLERrhee_RncHocCsS`, a fresh single-route fixture completed each of the six managed
Claude roles once. The exact Run permission card was reviewed before Appraise consumed its one execution
consent. The sole Chromium run passed, its Activity and Result survived reopen, and the managed Triager
produced one report. A separate two-route fixture stopped at scenario review after Discovery captured only one
of its two approved routes. These are separate outcomes with separate durable records.

On that same final build, ChatGPT Responses, Claude Code `2.1.332`, and Cursor CLI `2026.11.22-e9042b2` each
completed a fresh reviewed project lookup. The matching case in a separate project stayed out of the result.
Reopening retained one original completed attempt for each provider.

## Enable Cursor lookups on macOS

Obtain the matching macOS CLI archive via the [official Cursor installer](https://cursor.com/docs/cli/installation).
Pin the archive from a trusted source in `APPRAISE_CURSOR_CLI_ARCHIVE` (absolute path) and
`APPRAISE_CURSOR_CLI_SHA256` (lowercase SHA-256 digest) and restart Appraise. Appraise verifies the private
staged bundle before using it. An ordinary Cursor desktop or CLI installation uses its own profile.

In **Settings → Agent setup**, select **Connect Cursor** and complete Cursor's browser sign-in. Cursor owns
the account session in an isolated AES-256 encrypted macOS profile. The volume passphrase is held in
Keychain. Settings reports the account connection without returning tokens, account identifiers, or raw CLI
output. Cursor's account status does not expose billing tier. Usage remains on the user's Cursor account.
The account launcher is scoped to the private profile, scratch files, and system browser handoff. Appraise
supervises the Cursor process group and detaches the encrypted volume after use. A macOS fixture killed
the Appraise parent while a synthetic child held the mount, then verified that the volume detached and its
test data reopened.

Appraise holds a private SQLite lock across each encrypted-profile lease. On macOS 27.2.1 an interrupted
lease could leave its encrypted disk image attached after the volume was unmounted, causing the next process to
fail the encryption check. Appraise now checks the exact private image path, owner, and disk identity before
ejecting an unmounted attachment without force. Mounted and ambiguous attachments
are refused. Disposable APFS tests reopened the original marker after interrupted leases, confirmed a concurrent
Appraise process could not enter an active lease, and verified an unrelated attached image stayed in place.

On Node.js 26.13.1, closing IPC from Appraise could suppress the supervisor’s `close` event even after the
Cursor process exited. An explicit stop now sends a message so the supervisor can close IPC after the Cursor
process exits. The regression tests cover both explicit stop and Appraise process death.

In chat, select **Use Cursor for lookups**, save a lookup, and review it. Appraise asks Cursor for a fixed
confirmation over ACP in Ask mode with tool permissions denied. Search terms, matching records, and Appraise
project files stay local. A verified reply triggers the same Appraise project-scoped lookup and durable
attempt tracking as the other providers. **Disconnect locally** signs out the isolated Cursor profile.

Synthetic tests exercise the connection and ACP protocol, permission denial, and durable lookup boundaries.
On macOS, the pinned Cursor CLI completed browser sign-in and returned a numeric account ID. Appraise recognized
the existing encrypted session after accepting that ID format.

The first checkout attempt settled as unresolved. Startup probes reproduced two launcher problems before the model
prompt. Cursor needed more concurrent tunnels to load its model catalog and needed to save its selected model in the
private global config. Appraise raises the connection cap for the Cursor relay and keeps duplicate deny rules in an
immutable workspace config. The pinned Cursor CLI then opened an authenticated Ask session over the same restricted
relay.

On a fresh saved checkout message, the local preview completed a live Cursor lookup with pinned CLI
`2026.11.22-e9042b2`. The UI and SQLite showed exactly **Guest checkout returns an order number** in the selected
project. The result persisted after a browser reload and opened the matching case. A separately seeded matching case
in another project stayed out of the result. The earlier unresolved attempt kept its recorded state. The browser
test used Playwright because the in-app browser host was unavailable.

The clean macOS install with the supervisor fix also completed a fresh Cursor checkout lookup and returned only
the case in the selected project. Its result survived browser reload, Appraise restart, and local disconnect.
Restarting after the original stalled request showed an unknown outcome and preserved the single attempt.
Local disconnect disabled future Cursor sends. After targeted provider-side revocation, the CLI still reported
`authenticated` but returned no verifiable account identity. Appraise offered **Connect Cursor** and rejected a
fresh checkout through its server action before starting a provider attempt. These checks cover the Appraise
lookup path and leave direct provider token acceptance unverified.

| Provider    | Starting path                                                                                                                                                                                                                  | Evidence still needed                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT     | Use Settings to start browser consent for the local open-source preview. In a saved project chat, select **Use ChatGPT for lookups**, open **Review ChatGPT lookup** on a saved search, and choose **Send lookup to ChatGPT**. | One live lookup matched the expected project record on macOS. Live disconnect, expiration, interrupted requests, and other installations still need coverage. [OpenAI Responses guidance](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) |
| Claude Code | Use **Connect Claude Code** in Settings and complete Anthropic's own sign-in. Choose Claude Code in chat and review a saved lookup before sending it.                                                                          | One live subscription lookup matched the expected project record on macOS. Live disconnect, expiration, and other installations still need coverage. [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)                                  |
| Cursor      | Use **Connect Cursor** in Settings, complete Cursor's browser sign-in, then review a new saved lookup in chat.                                                                                                                 | Clean macOS sign-in, scoped lookup, reload, restart, local disconnect, and refusal after targeted revocation were verified. Other installations still need coverage. [Cursor ACP documentation](https://cursor.com/docs/cli/acp)                                             |

## Qualification sequence

Use separate fresh Appraise installations and provider profiles for provider qualification. Each installation has the selected
provider as its only available engine. Record Appraise, OS, package, and runtime versions.

1. In Appraise, choose the provider in Settings. Show detected runtime or show provisioning progress and actionable
   failures. Complete the provider-owned browser sign-in from the Appraise entry point.
2. Open a disposable project with a uniquely named checkout case. Ask Appraise to find that case. Verify a completed
   provider turn, the matching project and case ID from Appraise's read operation, and an accurate displayed result.
   Compare the fixture before and after the read.
3. Disconnect the provider in Appraise. Verify the visible disconnected state, refusal to begin a new turn, and the
   behavior of the saved conversation. Exercise the provider's supported expiration or revocation path and verify
   that the UI requests sign-in again.
4. Interrupt an in-flight read after the provider may have accepted it. Restart Appraise and verify that it can show
   recorded progress, a confirmed result, or an explicitly unknown outcome. Compare observed provider attempts before
   and after restart to catch accidental replays.

The run record should include the installer and runtime identity, whether user interaction required a terminal,
sign-in status, redacted effect correlation, the expected and observed result, disconnect behavior, and the outcome of
the original interrupted attempt. Leave uncertain attempts unresolved until the original effect can be reconciled.

The ChatGPT proof requires an eligible Appraise integration and consent from a test account holder. A deployment
outside the documented open-source local path requires the corresponding OpenAI enrollment. The Claude Code proof
requires the terms for hosting the official binary and a test account holder completing the provider’s own sign-in.
An authenticated terminal session, mock callback, canned provider response, or historical diagnostic receipt does not
establish this fresh-install outcome.

## Local release rehearsal

On macOS, a disposable database at migration 99 was upgraded with its saved conversation and historical Journey
already present. Migration 100 preserved the original message bytes and defaulted its lookup provider to Local.
SQLite reported zero foreign-key violations. Restoring a pre-upgrade backup preserved both records byte for byte.
A production rollback should restore that backup with the matching application artifact, so writes made after the
backup need independent retention before rollback. This rehearsal covers the local macOS path.
[OpenAI preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) ·
[Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
