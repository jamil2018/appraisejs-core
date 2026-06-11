import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createOfflineDraft, validatePlanFile } from './plan-file.js'

const workspaces: string[] = []

async function workspace() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-cli-plan-'))
  workspaces.push(directory)
  await fs.writeFile(path.join(directory, 'package.json'), '{"name":"plan-test"}')
  return directory
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('plan file commands', () => {
  it('validates a structured YAML plan and returns machine-readable metadata', async () => {
    const cwd = await workspace()
    const file = path.join(cwd, 'plan.yaml')
    await fs.writeFile(
      file,
      [
        'version: "1"',
        'planId: cli-plan',
        'revision: 1',
        'lifecycle: draft',
        'goal: Exercise CLI recovery',
        'tasks:',
        '  - id: add-tests',
        '    title: Add tests',
        '    description: Cover the CLI',
        '    acceptanceCriteria: [Tests pass]',
        '    validationIntent: Run package tests',
        'edges: []',
        'implementationGroups:',
        '  - id: cli',
        '    taskIds: [add-tests]',
      ].join('\n'),
    )

    await expect(validatePlanFile(file)).resolves.toMatchObject({
      ok: true,
      schema: 'appraise.plan/v1',
      planId: 'cli-plan',
      revision: 1,
      lifecycle: 'draft',
    })
  })

  it('creates only a new offline draft and refuses overwrite or progressed lifecycle', async () => {
    const cwd = await workspace()
    const input = path.join(cwd, 'input.yaml')
    await fs.writeFile(
      input,
      JSON.stringify({
        version: '1',
        planId: 'offline-plan',
        revision: 1,
        lifecycle: 'draft',
        goal: 'Create offline',
        tasks: [
          {
            id: 'draft',
            title: 'Draft',
            description: 'Draft only',
            acceptanceCriteria: ['Created'],
            validationIntent: 'Validate file',
          },
        ],
        edges: [],
        implementationGroups: [{ id: 'draft', taskIds: ['draft'] }],
      }),
    )

    await expect(createOfflineDraft(input, cwd)).resolves.toMatchObject({
      mode: 'offline',
      lifecycle: 'draft',
      warning: expect.stringContaining('not registered'),
    })
    await expect(createOfflineDraft(input, cwd)).rejects.toThrow('already exists')

    const progressed = JSON.parse(await fs.readFile(input, 'utf8')) as Record<string, unknown>
    progressed.planId = 'progressed-plan'
    progressed.lifecycle = 'plan_approved'
    await fs.writeFile(input, JSON.stringify(progressed))
    await expect(createOfflineDraft(input, cwd)).rejects.toThrow('draft lifecycle')
  })
})
