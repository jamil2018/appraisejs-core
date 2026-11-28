import { describe, expect, it, vi } from 'vitest'

import { ClaudeCodeJourneyFailure, type ClaudeCodeCli, type ClaudeCodeReply } from './claude-code-cli'
import { createClaudeCodeConnection } from './claude-code-connection-service'
import { classifyClaudeCodeJourneyFailure, createClaudeCodeJourneySender } from './claude-code-journey-sender'

const image = 'a'.repeat(64)

function statusReply(email: string, loggedIn = true): ClaudeCodeReply {
  return {
    exitCode: loggedIn ? 0 : 1,
    output: JSON.stringify({
      loggedIn,
      email,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      subscriptionType: 'pro',
    }),
  }
}

function result(value: unknown, structured = false): ClaudeCodeReply {
  return {
    exitCode: 0,
    output: JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      ...(structured ? { structured_output: value } : { result: JSON.stringify(value) }),
    }),
  }
}

describe('Claude Code Journey sender', () => {
  it('binds an opaque account and returns one JSON object through the verified CLI', async () => {
    const run = vi
      .fn<ClaudeCodeCli['run']>()
      .mockImplementation(async command =>
        command === 'status' ? statusReply('person@example.test') : result({ role: 'analysis' }),
      )
    const connection = createClaudeCodeConnection(async () => ({ executableSha256: image, run }))
    const sender = await createClaudeCodeJourneySender(connection.bindJourney)
    expect(sender.identity).toEqual({
      executableSha256: image,
      accountFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      protocol: 'claude-code-print/v1',
    })
    expect(JSON.stringify(sender.identity)).not.toContain('person@example.test')
    expect(await sender.run('bounded role prompt')).toBe('{"role":"analysis"}')
    expect(run.mock.calls.map(([command]) => command)).toEqual(['status', 'status', 'journey'])
    await expect(sender.run('duplicate')).rejects.toThrow('Connect Claude Code')
    expect(run.mock.calls.filter(([command]) => command === 'journey')).toHaveLength(1)
  })

  it('passes an exact schema and rejects a changed account reply', async () => {
    let email = 'person@example.test'
    const run = vi
      .fn<ClaudeCodeCli['run']>()
      .mockImplementation(async command =>
        command === 'status' ? statusReply(email) : result({ verdict: 'ready' }, true),
      )
    const connection = createClaudeCodeConnection(async () => ({ executableSha256: image, run }))
    const schema = { type: 'object', properties: { verdict: { type: 'string' } } }
    const sender = await createClaudeCodeJourneySender(connection.bindJourney)
    expect(await sender.run('prompt', schema)).toBe('{"verdict":"ready"}')
    expect(run.mock.calls.at(-1)).toEqual(['journey', { input: 'prompt', journeySchema: schema }])

    const changed = await createClaudeCodeJourneySender(connection.bindJourney)
    email = 'other@example.test'
    await expect(changed.run('prompt', schema)).rejects.toThrow('Connect Claude Code')
    expect(run.mock.calls.filter(([command]) => command === 'journey')).toHaveLength(1)
  })

  it('passes the selected model and effort to the one verified CLI dispatch', async () => {
    const run = vi
      .fn<ClaudeCodeCli['run']>()
      .mockImplementation(async command =>
        command === 'status' ? statusReply('person@example.test') : result({ verdict: 'ready' }),
      )
    const connection = createClaudeCodeConnection(async () => ({ executableSha256: image, run }))
    const sender = await createClaudeCodeJourneySender(connection.bindJourney)
    expect(await sender.run('prompt', undefined, { managedWorkerModel: 'opus', managedWorkerEffort: 'high' })).toBe(
      '{"verdict":"ready"}',
    )
    expect(run.mock.calls.at(-1)).toEqual([
      'journey',
      {
        input: 'prompt',
        journeySchema: undefined,
        journeyModel: 'opus',
        journeyEffort: 'high',
      },
    ])
    expect(run.mock.calls.filter(([command]) => command === 'journey')).toHaveLength(1)
  })

  it('rejects changed image, ineligible account, and sign-out without dispatch', async () => {
    let digest = image
    const run = vi
      .fn<ClaudeCodeCli['run']>()
      .mockImplementation(async command =>
        command === 'status' ? statusReply('person@example.test') : result({ ok: true }),
      )
    const connection = createClaudeCodeConnection(async () => ({ executableSha256: digest, run }))
    const sender = await createClaudeCodeJourneySender(connection.bindJourney)
    digest = 'b'.repeat(64)
    await expect(sender.run('prompt')).rejects.toThrow('Connect Claude Code')
    expect(run.mock.calls.filter(([command]) => command === 'journey')).toHaveLength(0)

    digest = image
    const second = await createClaudeCodeJourneySender(connection.bindJourney)
    await connection.signOut()
    await expect(second.run('prompt')).rejects.toThrow('Connect Claude Code')
    expect(run.mock.calls.filter(([command]) => command === 'journey')).toHaveLength(0)

    const ineligible = createClaudeCodeConnection(async () => ({
      executableSha256: image,
      run: async () => statusReply('person@example.test', false),
    }))
    await expect(createClaudeCodeJourneySender(ineligible.bindJourney)).rejects.toThrow('Connect Claude Code')
  })

  it.each([
    { reply: { exitCode: 1, output: 'private error' }, schema: undefined },
    { reply: { exitCode: 0, output: 'private broken JSON' }, schema: undefined },
    {
      reply: { exitCode: 0, output: JSON.stringify({ type: 'result', subtype: 'error', is_error: true }) },
      schema: undefined,
    },
  ])('treats incomplete or failed CLI output as unknown without raw details', async ({ reply, schema }) => {
    const sender = await createClaudeCodeJourneySender(async () => ({
      identity: {
        executableSha256: image,
        accountFingerprint: 'b'.repeat(64),
        protocol: 'claude-code-print/v1' as const,
      },
      run: async () => reply,
    }))
    await expect(sender.run('prompt', schema)).rejects.toThrow('Claude Code Journey outcome is unknown.')
  })

  it.each([
    { reply: result(['array']), schema: undefined, expected: '["array"]' },
    { reply: result({ ok: true }), schema: { type: 'object' }, expected: 'null' },
  ])('passes completed but invalid proposals to the owning role validator', async ({ reply, schema, expected }) => {
    const sender = await createClaudeCodeJourneySender(async () => ({
      identity: { executableSha256: image, accountFingerprint: 'b'.repeat(64), protocol: 'claude-code-print/v1' },
      run: async () => reply,
    }))
    expect(await sender.run('prompt', schema)).toBe(expected)
  })

  it.each([
    { code: 'authentication_error', detail: 'authorization error' },
    { code: 'rate_limit_error', detail: 'rate or capacity limit' },
    { code: 'invalid_request_error', detail: 'invalid request' },
    { code: 'api_error', detail: 'provider API error' },
    { code: 'network_error', detail: 'transport error' },
    { code: 'unexpected_provider_code', detail: 'unclassified error' },
  ])('reports only allowlisted terminal failure categories for $code', async ({ code, detail }) => {
    const privateMessage = 'private account and request details'
    const sender = await createClaudeCodeJourneySender(async () => ({
      identity: { executableSha256: image, accountFingerprint: 'b'.repeat(64), protocol: 'claude-code-print/v1' },
      run: async () => ({
        exitCode: 1,
        output: JSON.stringify({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          error: { code, message: privateMessage },
          result: privateMessage,
        }),
      }),
    }))
    let failure: unknown
    try {
      await sender.run('prompt')
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ClaudeCodeJourneyFailure)
    const classified = classifyClaudeCodeJourneyFailure(failure)
    expect(classified).toContain(detail)
    expect(classified).not.toContain(privateMessage)
    expect((failure as Error).message).not.toContain(privateMessage)
  })

  it('reports a recognized CLI status prefix without retaining the error text', async () => {
    const sender = await createClaudeCodeJourneySender(async () => ({
      identity: { executableSha256: image, accountFingerprint: 'b'.repeat(64), protocol: 'claude-code-print/v1' },
      run: async () => ({
        exitCode: 1,
        output: JSON.stringify({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          errors: ['API Error: 401 private account details'],
        }),
      }),
    }))
    const failure = await sender.run('prompt').catch((error: unknown) => error)
    expect(classifyClaudeCodeJourneyFailure(failure)).toContain('authorization error')
    expect(classifyClaudeCodeJourneyFailure(failure)).not.toContain('private account details')
  })

  it('uses one fixed generic detail for unexpected errors', () => {
    expect(classifyClaudeCodeJourneyFailure(new Error('private CLI stderr'))).toBe(
      'Claude Code sender did not complete; the original outcome may be unknown.',
    )
  })
})
