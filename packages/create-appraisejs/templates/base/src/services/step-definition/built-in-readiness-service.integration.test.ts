import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  builtInStepDefinitions,
  stepDefinitionContentHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  readyStepDefinitionRowsForSearch,
  readyStepDefinitionSearchIndexHash,
} from './ready-step-definition-search-index'
import { ensureBuiltInStepDefinitionReadiness } from './built-in-readiness-service'

let workspace: string
let prisma: PrismaClient

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-built-in-readiness-'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  prisma = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
})

afterEach(async () => {
  await prisma?.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

describe('built-in Step Definition readiness', () => {
  it('seeds a pristine registry and binds its manifest to immutable source and ready-index content', async () => {
    const receipt = await ensureBuiltInStepDefinitionReadiness(prisma)

    expect(receipt).toMatchObject({ seeded: builtInStepDefinitions.length, repaired: 0, unchanged: 0, conflicting: 0 })
    expect(receipt.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(receipt.manifestHash).not.toBe(
      stepDefinitionContentHash(builtInStepDefinitions.map(definition => definition.identity)),
    )
    expect(receipt.readyIndexHash).toBe(
      readyStepDefinitionSearchIndexHash(await readyStepDefinitionRowsForSearch(prisma)),
    )
  })

  it('reports unchanged rows on startup and keeps the content-addressed receipt stable', async () => {
    const first = await ensureBuiltInStepDefinitionReadiness(prisma)
    const replay = await ensureBuiltInStepDefinitionReadiness(prisma)

    expect(replay).toMatchObject({ seeded: 0, repaired: 0, unchanged: builtInStepDefinitions.length, conflicting: 0 })
    expect(replay.manifestHash).toBe(first.manifestHash)
    expect(replay.readyIndexHash).toBe(first.readyIndexHash)
  })

  it('repairs a deleted source registration without reclassifying the remaining rows as seeded', async () => {
    await ensureBuiltInStepDefinitionReadiness(prisma)
    const definition = builtInStepDefinitions[0]!
    const reference = { id: definition.identity.id, version: definition.identity.version }
    await prisma.stepPublicationReceipt.delete({
      where: { stepId_stepVersion: { stepId: definition.identity.id, stepVersion: definition.identity.version } },
    })
    await prisma.stepHumanProjection.delete({
      where: { stepId_stepVersion: { stepId: reference.id, stepVersion: reference.version } },
    })
    await prisma.stepExecutionBinding.delete({
      where: { stepId_stepVersion: { stepId: reference.id, stepVersion: reference.version } },
    })
    await prisma.stepDefinition.delete({ where: { id_version: reference } })

    await expect(ensureBuiltInStepDefinitionReadiness(prisma)).resolves.toMatchObject({
      seeded: 0,
      repaired: 1,
      unchanged: builtInStepDefinitions.length - 1,
      conflicting: 0,
    })
  })

  it('restores a missing publication receipt without replacing the immutable definition', async () => {
    await ensureBuiltInStepDefinitionReadiness(prisma)
    const definition = builtInStepDefinitions[0]!
    const reference = { id: definition.identity.id, version: definition.identity.version }
    const before = await prisma.stepDefinition.findUniqueOrThrow({ where: { id_version: reference } })
    await prisma.stepPublicationReceipt.delete({
      where: { stepId_stepVersion: { stepId: definition.identity.id, stepVersion: definition.identity.version } },
    })

    await expect(ensureBuiltInStepDefinitionReadiness(prisma)).resolves.toMatchObject({ repaired: 1 })
    await expect(prisma.stepDefinition.findUniqueOrThrow({ where: { id_version: reference } })).resolves.toMatchObject({
      definitionHash: before.definitionHash,
    })
    await expect(
      prisma.stepPublicationReceipt.findUnique({
        where: { stepId_stepVersion: { stepId: definition.identity.id, stepVersion: definition.identity.version } },
      }),
    ).resolves.toMatchObject({ receiptJson: expect.stringContaining('executableReadiness') })
  })

  it('reports immutable hash conflicts without overwriting source-owned registration state', async () => {
    await ensureBuiltInStepDefinitionReadiness(prisma)
    const definition = builtInStepDefinitions[0]!
    const reference = { id: definition.identity.id, version: definition.identity.version }
    await prisma.stepDefinition.update({
      where: { id_version: reference },
      data: { definitionHash: `sha256:${'f'.repeat(64)}` },
    })

    await expect(ensureBuiltInStepDefinitionReadiness(prisma)).rejects.toMatchObject({
      code: 'immutable_definition',
      details: expect.objectContaining({ conflicting: 1 }),
    })
    await expect(prisma.stepDefinition.findUniqueOrThrow({ where: { id_version: reference } })).resolves.toMatchObject({
      definitionHash: `sha256:${'f'.repeat(64)}`,
    })
  })
})
