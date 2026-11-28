import { z } from 'zod'

import { ClaudeCodeJourneyFailure, type ClaudeCodeJourneyFailureReason } from './claude-code-cli'
import { bindClaudeCodeJourney } from './claude-code-connection-service'
import type { ManagedWorkerPreferences } from '@/lib/quality-journey/managed-worker-preferences'

const terminalResponse = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  error_code: z.unknown().optional(),
  error: z.unknown().optional(),
  errors: z.unknown().optional(),
})

function terminalFailureReason(terminal: z.infer<typeof terminalResponse>): ClaudeCodeJourneyFailureReason {
  const detail = terminal.error
  const structuredCode =
    detail && typeof detail === 'object' && !Array.isArray(detail)
      ? ((detail as { code?: unknown; type?: unknown }).code ?? (detail as { type?: unknown }).type)
      : undefined
  const code = typeof terminal.error_code === 'string' ? terminal.error_code : structuredCode
  if (code === 'authentication_error' || code === 'authorization_error' || code === 'permission_error')
    return 'TERMINAL_AUTHORIZATION'
  if (code === 'rate_limit_error' || code === 'overloaded_error') return 'TERMINAL_RATE_LIMIT'
  if (code === 'invalid_request_error') return 'TERMINAL_INVALID_REQUEST'
  if (code === 'api_error') return 'TERMINAL_PROVIDER_ERROR'
  if (code === 'network_error' || code === 'transport_error') return 'TERMINAL_TRANSPORT'
  // Some CLI releases put the HTTP status in the error strings. Keep only a recognized status prefix.
  const errors = Array.isArray(terminal.errors) ? terminal.errors.slice(0, 8) : []
  for (const entry of [terminal.result, ...errors]) {
    if (typeof entry !== 'string') continue
    const status = /^API Error: (400|401|403|429|529)\b/i.exec(entry)?.[1]
    if (status === '401' || status === '403') return 'TERMINAL_AUTHORIZATION'
    if (status === '429' || status === '529') return 'TERMINAL_RATE_LIMIT'
    if (status === '400') return 'TERMINAL_INVALID_REQUEST'
  }
  return 'TERMINAL_UNCLASSIFIED'
}

function readRoleOutput(raw: string, exitCode: number, outputSchema?: object) {
  let terminal: z.infer<typeof terminalResponse>
  try {
    terminal = terminalResponse.parse(JSON.parse(raw))
  } catch {
    throw new ClaudeCodeJourneyFailure(exitCode === 0 ? 'RESPONSE_INVALID' : 'CHILD_NONZERO_EXIT')
  }
  if (terminal.is_error) throw new ClaudeCodeJourneyFailure(terminalFailureReason(terminal))
  if (exitCode !== 0) throw new ClaudeCodeJourneyFailure('CHILD_NONZERO_EXIT')
  if (terminal.subtype !== 'success') throw new ClaudeCodeJourneyFailure('RESPONSE_INVALID')
  // A clean transport completion lets the owning role validate the proposal and record proved cleanup.
  return outputSchema ? JSON.stringify(terminal.structured_output ?? null) : (terminal.result ?? '')
}

const fixedFailureDetails: Record<ClaudeCodeJourneyFailureReason, string> = {
  PROXY_IDLE_TIMEOUT: 'Claude Code Journey provider connection reached its idle limit; outcome is unconfirmed.',
  CHILD_START_FAILED: 'Claude Code Journey process could not start; no result was accepted.',
  CHILD_TIMEOUT: 'Claude Code Journey process reached its 180-second deadline; outcome is unconfirmed.',
  CHILD_INTERRUPTED: 'Claude Code Journey process was interrupted; outcome is unconfirmed.',
  OUTPUT_LIMIT: 'Claude Code Journey response exceeded the transport limit; outcome is unconfirmed.',
  CHILD_IO_FAILED: 'Claude Code Journey process I/O failed; outcome is unconfirmed.',
  CHILD_CLEANUP_UNPROVEN: 'Claude Code Journey child cleanup could not be proven; outcome is unconfirmed.',
  CHILD_NONZERO_EXIT: 'Claude Code Journey process exited without a confirmed result.',
  RESPONSE_INVALID: 'Claude Code Journey response was incomplete or invalid JSON.',
  TERMINAL_AUTHORIZATION: 'Claude Code Journey reported an authorization error; outcome is unconfirmed.',
  TERMINAL_RATE_LIMIT: 'Claude Code Journey reported a provider rate or capacity limit; outcome is unconfirmed.',
  TERMINAL_INVALID_REQUEST: 'Claude Code Journey reported an invalid request; outcome is unconfirmed.',
  TERMINAL_PROVIDER_ERROR: 'Claude Code Journey reported a provider API error; outcome is unconfirmed.',
  TERMINAL_TRANSPORT: 'Claude Code Journey reported a provider transport error; outcome is unconfirmed.',
  TERMINAL_UNCLASSIFIED: 'Claude Code Journey reported an unclassified error; outcome is unconfirmed.',
}

export function classifyClaudeCodeJourneyFailure(error: unknown): string {
  return error instanceof ClaudeCodeJourneyFailure
    ? fixedFailureDetails[error.reason]
    : 'Claude Code sender did not complete; the original outcome may be unknown.'
}

export async function createClaudeCodeJourneySender(bindJourney = bindClaudeCodeJourney) {
  const bound = await bindJourney()
  return {
    identity: bound.identity,
    async run(prompt: string, outputSchema?: object, preferences: ManagedWorkerPreferences = {}): Promise<string> {
      const reply = await bound.run(prompt, outputSchema, preferences)
      return readRoleOutput(reply.output, reply.exitCode, outputSchema)
    },
  }
}

export const bindClaudeCodeJourneySender = createClaudeCodeJourneySender
