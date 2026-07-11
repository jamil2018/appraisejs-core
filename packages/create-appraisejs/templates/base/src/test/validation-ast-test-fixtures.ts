import { PrismaClient } from '@prisma/client'

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
