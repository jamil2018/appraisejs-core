import { describe, expect, it, vi } from 'vitest'

import type { ClaudeCodeCli } from '@/services/provider-connection/claude-code-cli'

import { createClaudeCodeReadProvider } from './claude-code-read-provider'

function fixture(structuredOutput: unknown) {
  const run = vi.fn<ClaudeCodeCli['run']>().mockResolvedValue({
    exitCode: 0,
    output: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      structured_output: structuredOutput,
    }),
  })
  const lookup = vi.fn().mockResolvedValue([{ title: 'Secret local record' }])
  const query = { kind: 'TEST_CASE', query: 'checkout' } as const
  return { run, lookup, query, signal: new AbortController().signal }
}

describe('Claude Code read provider', () => {
  it('requests exactly one Appraise read after a verified terminal response', async () => {
    const { run, ...request } = fixture({ action: 'workspace_record_search' })
    const provider = await createClaudeCodeReadProvider(async () => fn => fn({ run }))
    expect(await provider(request)).toBe('completed')
    expect(request.lookup).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledExactlyOnceWith('lookup', {
      input: JSON.stringify(request.query),
      signal: request.signal,
      lookupArgs: expect.arrayContaining(['--safe-mode', '--tools', '', '--strict-mcp-config', '--json-schema']),
    })
  })

  it.each([undefined, { action: 'workspace_record_search', project: 'other-project' }, { action: 'write' }])(
    'does not read records for an unexpected structured result',
    async response => {
      const { run, ...request } = fixture(response)
      const provider = await createClaudeCodeReadProvider(async () => fn => fn({ run }))
      expect(await provider(request)).toBe('failed')
      expect(request.lookup).not.toHaveBeenCalled()
    },
  )

  it('preserves uncertainty when the CLI returns no complete terminal result', async () => {
    const { run, ...request } = fixture(undefined)
    run.mockResolvedValue({ exitCode: 1, output: 'partial output' })
    const provider = await createClaudeCodeReadProvider(async () => fn => fn({ run }))
    await expect(provider(request)).rejects.toThrow()
    expect(request.lookup).not.toHaveBeenCalled()
  })
})
