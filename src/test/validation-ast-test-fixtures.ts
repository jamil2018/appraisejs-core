import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

import { prepareCleanCoordinatorPlanRuntimeTestDatabase } from '@/test/plan-runtime-schema-test-helper'

export function basicValidationAstSubmission(planHash: string, taskId = 'task-one') {
  return {
    expectedPlanHash: planHash,
    ast: {
      schemaVersion: 1 as const,
      id: 'navigation',
      title: 'Navigation',
      purpose: 'Open home.',
      coversTaskIds: [taskId],
      matrix: [{ browser: 'chromium' as const, environmentId: 'local' }],
      scenarios: [
        {
          id: 'open-home',
          title: 'Open home',
          steps: [
            {
              id: 'open',
              keyword: 'When' as const,
              description: 'the user opens home',
              action: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
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
      schemaVersion: 1 as const,
      id: 'fresh-target-audit',
      title: 'Fresh target audit',
      purpose: 'Exercise navigation and reload without substantiating the claimed product behavior.',
      coversTaskIds: ['task-create', 'task-complete', 'task-filter', 'task-persist', 'task-responsive'],
      matrix: [{ browser: 'chromium' as const, environmentId: 'local' }],
      scenarios: [
        {
          id: 'page-ready',
          title: 'Page becomes ready',
          steps: [
            {
              id: 'open',
              keyword: 'When' as const,
              description: 'the user opens the application',
              action: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
            },
            {
              id: 'ready',
              keyword: 'Then' as const,
              description: 'the page is ready',
              action: { id: 'browser.waits.page-ready', version: '1', inputs: {} },
            },
            {
              id: 'reload',
              keyword: 'When' as const,
              description: 'the user reloads the application',
              action: { id: 'browser.navigation.reload', version: '1', inputs: {} },
            },
            {
              id: 'ready-again',
              keyword: 'Then' as const,
              description: 'the page is ready again',
              action: { id: 'browser.waits.page-ready', version: '1', inputs: {} },
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
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
  return { workspace, databasePath, client: sqliteTestClient(databasePath) }
}
