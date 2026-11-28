import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertClaudeCodeJourneyRequest, journeyArguments, runOwnedJourneyCommand } from './claude-code-cli'

const options = { cwd: tmpdir(), env: { NODE_ENV: 'test' as const, PATH: '/usr/bin:/bin' } }

it('admits the complete canonical triage input and rejects oversized requests', () => {
  expect(() => assertClaudeCodeJourneyRequest('x'.repeat(2_000_000))).not.toThrow()
  expect(() => assertClaudeCodeJourneyRequest('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('input is invalid')
  expect(() => assertClaudeCodeJourneyRequest('prompt', { description: 'x'.repeat(64 * 1024) })).toThrow(
    'schema is too large',
  )
})

it('passes only selected supported model and effort flags to Claude Code', () => {
  const args = journeyArguments(undefined, { journeyModel: 'sonnet', journeyEffort: 'low' })
  expect(args).toContain('--model')
  expect(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)).toEqual(['--model', 'sonnet'])
  expect(args.slice(args.indexOf('--effort'), args.indexOf('--effort') + 2)).toEqual(['--effort', 'low'])
  expect(journeyArguments()).not.toContain('--model')
  expect(journeyArguments()).not.toContain('--effort')
  expect(() => journeyArguments(undefined, { journeyModel: 'gpt-6.1-sol' })).toThrow('unavailable')
})

describe('owned Claude Code Journey child', () => {
  it('accepts a closed, bounded process with no surviving child group', async () => {
    const reply = await runOwnedJourneyCommand(
      process.execPath,
      ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.stdout.write("ok"))'],
      options,
      'fixture',
    )
    expect(reply).toEqual({ exitCode: 0, output: 'ok' })
  })

  it('rejects an interrupted process as unknown', async () => {
    const controller = new AbortController()
    const call = runOwnedJourneyCommand(
      process.execPath,
      ['-e', 'process.stdin.resume(); setTimeout(() => process.stdout.write("late"), 10_000)'],
      { ...options, signal: controller.signal },
      'fixture',
    )
    controller.abort()
    await expect(call).rejects.toThrow('Claude Code Journey outcome is unknown.')
  })

  it.each([path.join(tmpdir(), randomUUID()), `${process.execPath}/missing`])(
    'handles a spawn failure before Node assigns a process ID',
    async executable => {
      await expect(runOwnedJourneyCommand(executable, [], options, 'fixture')).rejects.toThrow(
        'Claude Code Journey outcome is unknown.',
      )
    },
  )

  it('rejects output over the bound', async () => {
    await expect(
      runOwnedJourneyCommand(
        process.execPath,
        ['-e', 'process.stdout.write("x".repeat(1024 * 1024 + 1))'],
        options,
        'fixture',
      ),
    ).rejects.toThrow('Claude Code Journey outcome is unknown.')
  })

  it('rejects an apparent success with a surviving descendant', async () => {
    await expect(
      runOwnedJourneyCommand(
        process.execPath,
        [
          '-e',
          'require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { stdio: "ignore" }).unref(); process.stdout.write("ok")',
        ],
        options,
        'fixture',
      ),
    ).rejects.toThrow('Claude Code Journey outcome is unknown.')
  }, 15_000)
})
