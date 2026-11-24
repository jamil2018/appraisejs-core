# Fresh-install provider proof

## Current evidence

Appraise has internal Codex provider intent, process supervision, and recovery building blocks for Quality Journeys.
M13 evidence covers specific native observations and leaves historical provider outcomes unresolved. Appraise's current
Journey setup exposes a Codex diagnostic and Settings links to it. **Settings → Agent setup → Connect ChatGPT**
prepares an expiring loopback authorization for a local macOS or Linux installation. Appraise verifies the signed
account identity and granted scopes before storing credentials in the operating-system user's private directory.
The local disconnect clears usable credentials. Synthetic tests exercise the callback and credential storage.
Live consent, provider switching, and a subscription-backed Appraise read remain open. Production Journey
app-server dispatch still refuses to start. Historical native attempts retain their recorded outcomes.
[Hosting and sessions](../../quality-journey-host-sessions.md) ·
[Provider intent](../../quality-journey-provider-intents.md) ·
[M13 evidence](../../../tasks/codex-app-server-journeys/M13-INTEGRATED-IMPLEMENTATION.md)

| Provider    | Starting path                                                                                                                                                                            | Evidence still needed                                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT     | Use Settings to start ChatGPT's browser consent for the local open-source preview.                                                                                                       | Verify consent on a clean install with an eligible account, then complete a subscription-backed turn returning the verified project record. [OpenAI app-server guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)                                                                                    |
| Claude Code | Evaluate hosting the official, unmodified Claude Code binary with provider-owned sign-in under Anthropic's published conditions. Review the commercial terms for this integration shape. | A clean Appraise install guides the user into Claude Code's sign-in flow and completes the same Appraise read. Claude.ai sign-in inside Appraise and Appraise handling Claude subscription credentials fall outside the published provider path. [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) |

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
[OpenAI preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) ·
[Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
