import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PrismaClient,
  StepParameterType,
  TemplateStepGroupType,
  TemplateStepIcon,
  TemplateStepType,
} from '@prisma/client'

import { defaultOperationRegistry } from '@/lib/operation-catalog'
import {
  copyMigratedTestDatabase,
  prepareCleanCoordinatorPlanRuntimeTestDatabase,
} from '@/test/plan-runtime-schema-test-helper'

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
      expectedFailures: [],
      scenarios: [
        {
          id: 'open-home',
          title: 'Open home',
          steps: [
            {
              id: 'open',
              keyword: 'When' as const,
              description: 'the user opens home',
              operation: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
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
      expectedFailures: [],
      scenarios: [
        {
          id: 'page-ready',
          title: 'Page becomes ready',
          steps: [
            {
              id: 'open',
              keyword: 'When' as const,
              description: 'the user opens the application',
              operation: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
            },
            {
              id: 'ready',
              keyword: 'Then' as const,
              description: 'the page is ready',
              operation: { id: 'browser.waits.page-ready', version: '1', inputs: {} },
            },
            {
              id: 'reload',
              keyword: 'When' as const,
              description: 'the user reloads the application',
              operation: { id: 'browser.navigation.reload', version: '1', inputs: {} },
            },
            {
              id: 'ready-again',
              keyword: 'Then' as const,
              description: 'the page is ready again',
              operation: { id: 'browser.waits.page-ready', version: '1', inputs: {} },
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

const testParameterType = (type: string): StepParameterType => {
  if (type === 'number') return StepParameterType.NUMBER
  if (type === 'boolean') return StepParameterType.BOOLEAN
  if (type === 'locator') return StepParameterType.LOCATOR
  return StepParameterType.STRING
}

export async function seedCanonicalOperationProjections(client: PrismaClient) {
  const summaries = [
    ...defaultOperationRegistry.list({}, 0, 100).items,
    ...defaultOperationRegistry.list({}, 100, 100).items,
  ]
  const descriptors = summaries.flatMap((_, offset) =>
    offset % 50 === 0
      ? defaultOperationRegistry.read(summaries.slice(offset, offset + 50).map(({ id, version }) => ({ id, version })))
      : [],
  )
  const groups = new Map<string, string>()

  for (const descriptor of descriptors) {
    for (const projection of descriptor.humanProjections) {
      let groupId = groups.get(projection.group)
      if (!groupId) {
        const group = await client.templateStepGroup.upsert({
          where: { name: projection.group },
          update: {},
          create: {
            name: projection.group,
            type: descriptor.categories.some(category => category.includes('assertion'))
              ? TemplateStepGroupType.VALIDATION
              : TemplateStepGroupType.ACTION,
          },
        })
        groupId = group.id
        groups.set(projection.group, group.id)
      }
      await client.templateStep.create({
        data: {
          name: projection.title,
          description: projection.description,
          signature: projection.signature,
          operationId: descriptor.id,
          operationVersion: descriptor.version,
          operationDescriptorHash: descriptor.descriptorHash,
          humanProjectionId: projection.id,
          operationMigrationState: 'mapped',
          type: descriptor.categories.some(category => category.includes('assertion'))
            ? TemplateStepType.ASSERTION
            : TemplateStepType.ACTION,
          icon: projection.icon as TemplateStepIcon,
          templateStepGroupId: groupId,
          parameters: {
            create: projection.parameterOrder.map((name, order) => ({
              name,
              order,
              type: testParameterType(descriptor.inputs.find(input => input.name === name)?.type ?? 'string'),
            })),
          },
        },
      })
    }
  }
}

export async function createPlanRuntimeTestWorkspace(prefix: string, databaseName: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const databasePath = path.join(workspace, databaseName)
  await fs.writeFile(path.join(workspace, 'package.json'), '{}')
  await copyMigratedTestDatabase(databasePath)
  await prepareCleanCoordinatorPlanRuntimeTestDatabase(databasePath)
  return { workspace, databasePath, client: sqliteTestClient(databasePath) }
}
