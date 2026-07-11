import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

import { ensureCoordinatorPlanRuntimeTestSchema } from '@/test/plan-runtime-schema-test-helper'

export function basicValidationAstSubmission(planHash: string, taskId = 'task-one') {
  return {
    expectedPlanHash: planHash,
    ast: {
      schemaVersion: '1' as const,
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

export function sqliteTestClient(databasePath: string) {
  return new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
}

export async function createPlanRuntimeTestWorkspace(prefix: string, databaseName: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const databasePath = path.join(workspace, databaseName)
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await fs.copyFile(path.join(process.cwd(), 'prisma', 'dev.db'), databasePath)
  await ensureCoordinatorPlanRuntimeTestSchema(databasePath)
  return { workspace, databasePath, client: sqliteTestClient(databasePath) }
}
