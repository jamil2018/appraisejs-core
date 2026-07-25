import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

import { builtInStepDefinitions, computeStepReferenceHash } from '../../packages/cucumber-runtime/src/step-definitions'
import {
  copyMigratedTestDatabase,
  prepareCleanCoordinatorPlanRuntimeTestDatabase,
} from '@/test/plan-runtime-schema-test-helper'

function exactInvocation(
  id: string,
  inputs: Record<string, unknown>,
  keyword: 'Given' | 'When' | 'Then' | 'And',
  description: string,
) {
  const definition = builtInStepDefinitions.find(item => item.identity.id === id)
  if (!definition) throw new Error(`Missing built-in Step Definition ${id}.`)
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

export function basicValidationAstSubmission(planHash: string, taskId = 'task-one') {
  return {
    expectedPlanHash: planHash,
    ast: {
      schemaVersion: 2 as const,
      id: 'navigation',
      title: 'Navigation',
      purpose: 'Open home.',
      coversTaskIds: [taskId],
      matrix: [{ browser: 'chromium' as const, environmentId: 'local' }],
      expectedFailures: [],
      scenarios: [
        {
          id: 'open-home',
          title: 'Open home',
          steps: [
            {
              id: 'open',
              invocation: exactInvocation('browser.navigation.goto', { url: '/' }, 'When', 'the user opens home'),
            },
          ],
        },
      ],
      qualityConcerns: [],
      customExtensions: [],
    },
    customExtensionProposals: [],
  }
}

export function inadequateFreshTargetAuditSubmission(planHash: string) {
  return {
    expectedPlanHash: planHash,
    ast: {
      schemaVersion: 2 as const,
      id: 'fresh-target-audit',
      title: 'Fresh target audit',
      purpose: 'Exercise navigation and reload without substantiating the claimed product behavior.',
      coversTaskIds: ['task-create', 'task-complete', 'task-filter', 'task-persist', 'task-responsive'],
      matrix: [{ browser: 'chromium' as const, environmentId: 'local' }],
      expectedFailures: [],
      scenarios: [
        {
          id: 'page-ready',
          title: 'Page becomes ready',
          steps: [
            {
              id: 'open',
              invocation: exactInvocation(
                'browser.navigation.goto',
                { url: '/' },
                'When',
                'the user opens the application',
              ),
            },
            {
              id: 'ready',
              invocation: exactInvocation('browser.waits.page-ready', {}, 'Then', 'the page is ready'),
            },
            {
              id: 'reload',
              invocation: exactInvocation('browser.navigation.reload', {}, 'When', 'the user reloads the application'),
            },
            {
              id: 'ready-again',
              invocation: exactInvocation('browser.waits.page-ready', {}, 'Then', 'the page is ready again'),
            },
          ],
        },
      ],
      qualityConcerns: ['accessibility', 'persistence', 'responsive'] as const,
      customExtensions: [],
    },
    customExtensionProposals: [],
  }
}

export function sqliteTestClient(databasePath: string) {
  return new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
}

export async function createPlanRuntimeTestWorkspace(prefix: string, databaseName: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const databasePath = path.join(workspace, databaseName)
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await copyMigratedTestDatabase(databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
  return { workspace, databasePath, client: sqliteTestClient(databasePath) }
}
