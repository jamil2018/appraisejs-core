import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serializeYamlArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { readValidationContext, resolveReusableValidationSteps } from './validation-authoring-context-service'

let workspace: string

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-context-'))
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await new PlanArtifactRepository(workspace).create(
    'plan',
    'plan-template-search',
    serializeYamlArtifact('plan', {
      version: '1',
      planId: 'plan-template-search',
      revision: 1,
      lifecycle: 'preparing_validations',
      goal: 'Resolve reusable browser steps',
      description: 'Exercise agent-facing template-step discovery.',
      tasks: [
        {
          id: 'task-search',
          title: 'Search reusable steps',
          description: 'Search reusable steps',
          acceptanceCriteria: ['Search succeeds'],
          validationIntent: 'Use reusable steps',
        },
      ],
      edges: [],
      implementationGroups: [],
    }),
  )
})

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true })
})

const entries = [
  ['upload-file', 'upload file', 'Upload a local file path through a file input element', 'upload {string}'],
  ['keyboard-shortcut', 'press keyboard shortcut', 'Press a page-level keyboard shortcut', 'shortcut {string}'],
  ['popup', 'click and switch to popup', 'Click an element and switch to its popup', 'popup {string}'],
  ['dialog', 'accept next dialog', 'Accept the next browser dialog', 'accept dialog'],
  ['download', 'click and wait for download', 'Capture filename and download path', 'download {string}'],
  ['storage', 'set local storage value', 'Set a localStorage key and value', 'storage {string} {string}'],
  ['response', 'wait for response', 'Wait for a response URL and status', 'response {string} {int}'],
  ['attribute', 'assert element attribute', 'Assert an element attribute value', 'attribute {string} {string}'],
] as const

function client() {
  const templateSteps = entries.map(([id, name, description, signature]) => ({
    id,
    name,
    description,
    signature,
    type: name.startsWith('assert') ? 'ASSERTION' : 'ACTION',
    templateStepGroupId: 'browser-group',
    parameters: [],
    templateStepGroup: {
      id: 'browser-group',
      name: 'browser workflow',
      description: 'Reusable browser mechanics',
      type: name.startsWith('assert') ? 'VALIDATION' : 'ACTION',
    },
  }))

  return {
    planProjection: {
      findUnique: async () => ({
        sourceHash: `sha256:${'a'.repeat(64)}`,
        targetProjectId: 'project-a',
        targetProject: {
          id: 'project-a',
          displayName: 'Project A',
          canonicalPath: '/tmp/project-a',
          fingerprint: `sha256:${'b'.repeat(64)}`,
        },
        tasks: [],
      }),
    },
    templateStep: { findMany: async () => templateSteps },
    stepBlock: { findMany: async () => [] },
    projectResourceOwnership: { findMany: async () => [] },
    module: { findMany: async () => [] },
    testSuite: { findMany: async () => [] },
    testCase: { findMany: async () => [] },
    locatorGroup: { findMany: async () => [] },
    locator: { findMany: async () => [] },
    environment: { findMany: async () => [] },
  } as unknown as PrismaClient
}

describe('template-step discovery', () => {
  it.each(entries.map(([id, name]) => [name, id]))('resolves the representative intent %s', async (intent, id) => {
    const result = await resolveReusableValidationSteps(
      'plan-template-search',
      { intent },
      { client: client(), projectDirectory: workspace },
    )
    expect(result.selected).toMatchObject({ id, name: intent })
  })

  it('returns descriptions, ordered parameters, and group metadata in validation context', async () => {
    const context = await readValidationContext('plan-template-search', {
      client: client(),
      projectDirectory: workspace,
      resourceTypes: ['templateSteps'],
    })
    if (!context.resources) throw new Error('Expected validation resources')

    expect(context.resources.templateSteps[0]).toMatchObject({
      description: expect.any(String),
      parameters: [],
      templateStepGroup: {
        name: 'browser workflow',
        description: 'Reusable browser mechanics',
      },
      scope: 'shared_library',
    })
  })
})
