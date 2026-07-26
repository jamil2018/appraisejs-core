import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { ValidationAstSubmission } from '@/lib/validation-ast'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  computeStepReferenceHash,
  stepDefinitionContentHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import {
  checkValidationAstForPlan,
  previewValidationAstForPlan,
  readValidationAstExtensionPolicyForPlan,
} from './validation-ast-operation-service'

const planHash = `sha256:${'a'.repeat(64)}`
const readyDefinitions = ['browser.navigation.goto', 'browser.keyboard.press', 'browser.viewport.set'].map(id => {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
  const hashes = computeStepDefinitionHashes(definition)
  const registryManifestHash = computeStepReferenceHash(definition)
  const receipt = {
    step: { id: definition.identity.id, version: definition.identity.version },
    ...hashes,
    registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, 'test-run'),
    conformanceRunId: 'test-run',
    reviewAuthority: 'test-reviewer',
    publishedAt: '2026-07-25T00:00:00.000Z',
  }
  return {
    status: 'ready',
    id: definition.identity.id,
    version: definition.identity.version,
    definitionJson: canonicalStepDefinitionJson(definition),
    ...hashes,
    publicationReceipt: {
      receiptHash: stepDefinitionContentHash(receipt),
      receiptJson: JSON.stringify(receipt),
    },
  }
})
const client = {
  planProjection: {
    findUnique: async () => ({
      planId: 'plan-one',
      revision: 1,
      lifecycle: 'preparing_validations',
      sourceHash: planHash,
      tasks: [{ taskId: 'task-one', position: 0 }],
      targetProject: { id: 'project-one', fingerprint: `sha256:${'b'.repeat(64)}` },
    }),
  },
  locatorGroup: { findMany: async () => [] },
  environment: { findMany: async () => [{ id: 'local', name: 'local' }] },
  stepDefinition: { findMany: async () => readyDefinitions },
} as unknown as PrismaClient

function invocation(
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then',
  description: string,
) {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)!
  return {
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs,
    presentation: { keyword, description },
  }
}

const submission = {
  expectedPlanHash: planHash,
  ast: {
    schemaVersion: 2,
    id: 'navigation',
    title: 'Navigation',
    purpose: 'Open home.',
    coversTaskIds: ['task-one'],
    matrix: [{ browser: 'chromium', environmentId: 'local' }],
    expectedFailures: [],
    scenarios: [
      {
        id: 'open-home',
        title: 'Open home',
        steps: [
          {
            id: 'open',
            invocation: invocation('browser.navigation.goto', { url: '/' }, 'When', 'the user opens home'),
          },
        ],
      },
    ],
    qualityConcerns: [],
    customExtensions: [],
  },
  customExtensionProposals: [],
} as const

describe('Validation AST operational context', () => {
  it('checks and previews against authoritative plan, target, catalog, graph, and environment hashes', async () => {
    const checked = await checkValidationAstForPlan('plan-one', submission, client)
    expect(checked).toMatchObject({
      valid: true,
      contextHash: expect.stringMatching(/^sha256:/),
    })
    await expect(previewValidationAstForPlan('plan-one', submission, client)).resolves.toMatchObject({
      valid: true,
      previewHash: expect.stringMatching(/^sha256:/),
      receiptHash: expect.stringMatching(/^sha256:/),
      commandReceipt: {
        catalogHash: expect.stringMatching(/^sha256:/),
        locatorGraphHash: expect.stringMatching(/^sha256:/),
      },
    })
  })

  it('accepts every capability advertised by built-in keyboard and viewport actions', async () => {
    const capabilitySubmission = structuredClone(submission) as unknown as ValidationAstSubmission
    capabilitySubmission.ast.scenarios[0].steps.push(
      {
        id: 'press-tab',
        invocation: invocation('browser.keyboard.press', { key: 'Tab' }, 'When', 'the user presses Tab'),
      },
      {
        id: 'mobile-viewport',
        invocation: invocation(
          'browser.viewport.set',
          { width: 390, height: 844 },
          'Then',
          'the viewport is mobile sized',
        ),
      },
    )

    const checked = await checkValidationAstForPlan('plan-one', capabilitySubmission, client)

    expect(checked.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'capability-unavailable' })]),
    )
    expect(checked.valid).toBe(true)
  })

  it('discovers a bounded versioned policy bound to the authoritative project', async () => {
    await expect(readValidationAstExtensionPolicyForPlan('plan-one', client)).resolves.toEqual({
      version: '1',
      projectId: 'project-one',
      projectFingerprint: `sha256:${'b'.repeat(64)}`,
      capabilityImports: { browser: ['@playwright/test'] },
      compilerVersion: expect.any(String),
      declarationHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
  })
})
