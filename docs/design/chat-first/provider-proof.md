# Fresh-install provider proof

## Current evidence

Appraise has internal Codex provider intent, process supervision, and recovery building blocks for Quality Journeys.
M13 evidence covers specific native observations and leaves historical provider outcomes unresolved. Appraise's current
Journey setup exposes a Codex diagnostic and Settings links to it. **Settings → Agent setup → Connect ChatGPT**
prepares an expiring loopback authorization for a local macOS or Linux installation. Appraise verifies the signed
account identity and granted scopes before storing credentials in the operating-system user's private directory.
The local disconnect clears usable credentials. Synthetic tests exercise the callback and credential storage.
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
first response. A result requires Appraise's local read and a confirmed native turn completion. Production
Journey dispatch retains its refusal, and historical attempts keep their recorded outcomes.
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

## Enable Claude Code lookups on macOS

Confirm coverage under [Anthropic's terms for running Claude Code in your product](https://code.claude.com/docs/en/legal-and-compliance#can-customers-offer-claude-code-in-their-products).
Use [Anthropic's native release verification instructions](https://code.claude.com/docs/en/setup) to verify an
unmodified macOS binary that supports `--safe-mode` and structured print output. Set
`APPRAISE_CLAUDE_CODE_EXECUTABLE` to its absolute path and `APPRAISE_CLAUDE_CODE_SHA256` to the lowercase digest
from the verified release manifest. Reverify and update the pin when upgrading. Appraise checks the installed image
before starting Claude Code and leaves the provider unavailable without this configuration.

In **Settings → Agent setup**, select **Connect Claude Code** and complete Anthropic's sign-in as prompted.
Claude Code manages sign-in and sign-out through its own commands, using a private `CLAUDE_CONFIG_DIR` under the
current OS user's home. **Disconnect locally** asks Claude Code to sign out of that profile. The local Appraise
installation should run on loopback and under that user account.

In a project chat, choose **Use Claude Code for lookups**, save a lookup, and review its record type and search
text. The restricted print-mode process receives only those reviewed fields. Its loopback HTTPS relay limits
egress to the documented Anthropic API and token refresh hosts. A successful structured result must request the
one fixed action before Appraise searches the active project. Appraise keeps the resulting records locally and
saves the attempt as `CLAUDE_CODE`. This integration is limited to saved project lookups in chat.

An offline rehearsal on a fresh Next.js 16.4.6 scaffold applied all 102 migrations. A synthetic CLI exercised
Settings connect and disconnect, the reviewed checkout lookup, project isolation, and result persistence after
reload. The pinned Claude Code 2.1.332 binary reported the isolated profile as disconnected and loaded inside
the lookup sandbox. Live Anthropic sign-in and inference still require an eligible account and operator coverage.

| Provider    | Starting path                                                                                                                                                                                                                  | Evidence still needed                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT     | Use Settings to start browser consent for the local open-source preview. In a saved project chat, select **Use ChatGPT for lookups**, open **Review ChatGPT lookup** on a saved search, and choose **Send lookup to ChatGPT**. | One live lookup matched the expected project record on macOS. Live disconnect, expiration, interrupted requests, and other installations still need coverage. [OpenAI Responses guidance](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) |
| Claude Code | Use **Connect Claude Code** in Settings and complete Anthropic's own sign-in. Choose Claude Code in chat and review a saved lookup before sending it.                                                                          | Live sign-in, lookup, and lifecycle checks still need an eligible test account. [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)                                                                                                       |

## Qualification sequence

Use separate fresh Appraise installations and provider profiles for the two runs. Each installation has the selected
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
