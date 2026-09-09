import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { collaborationRecordSchema } from '@/lib/repository-collaboration'

import { connectCollaboration, updateCollaborationPolicy } from './binding-service'
import { mapCollaborationEnvironment } from './environment-mapping-service'
import { applyCollaborationRecords } from './materialization-service'
import { projectAuthoredCollaborationSnapshot } from './projection-service'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture(suffix: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `appraise-collaboration-${suffix}-`))
  workspaces.push(workspace)
  await fs.mkdir(path.join(workspace, '.git'))
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  const target = await client.targetProject.create({
    data: {
      id: `target-${suffix}`,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: `Collaboration ${suffix}`,
      fingerprint: `sha256:${suffix.padEnd(64, suffix[0])}`,
    },
  })
  const binding = await connectCollaboration(
    {
      targetProjectId: target.id,
      repositoryRoot: workspace,
      trackedBranch: 'appraise-0.5',
      portableProjectId: 'portable-project',
      trustedPrincipalId: 'local-user',
      provenance: 'authenticated-host',
    },
    client,
  )
  const moduleRecord = await client.module.create({
    data: { id: `module-${suffix}`, name: 'Checkout', targetProjectId: target.id },
  })
  const tag = await client.tag.create({
    data: { id: `tag-${suffix}`, name: 'Smoke', tagExpression: '@smoke', targetProjectId: target.id },
  })
  const environment = await client.environment.create({
    data: {
      id: `environment-${suffix}`,
      name: 'Staging',
      baseUrl: `https://${suffix}.secret.example`,
      apiBaseUrl: `https://${suffix}.secret.example/api`,
      username: `${suffix}-user`,
      passwordEnvironmentVariable: `${suffix.toUpperCase()}_PASSWORD`,
      credentialState: 'REFERENCE_CONFIGURED',
      targetProjectId: target.id,
    },
  })
  const definition =
    builtInStepDefinitions.find(item => item.inputs.every(input => !input.required)) ?? builtInStepDefinitions[0]!
  const hashes = computeStepDefinitionHashes(definition)
  await client.stepDefinition.create({
    data: {
      id: definition.identity.id,
      version: definition.identity.version,
      status: 'ready',
      title: definition.intent.title,
      description: definition.intent.description,
      definitionJson: canonicalStepDefinitionJson(definition),
      definitionHash: hashes.definitionHash,
      humanProjectionHash: hashes.humanProjectionHash,
      executionHash: hashes.executionHash,
      provenanceJson: canonicalStepDefinitionJson(definition.provenance),
    },
  })
  const invocationJson = canonicalStepDefinitionJson({
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs: Object.fromEntries(
      definition.inputs.map(input => [
        input.name,
        input.defaultValue ?? (input.type === 'number' ? 1 : input.type === 'boolean' ? true : `value-${input.name}`),
      ]),
    ),
  })
  const locatorGroup = await client.locatorGroup.create({
    data: {
      id: `locator-group-${suffix}`,
      name: 'Checkout page',
      route: '/checkout',
      moduleId: moduleRecord.id,
      targetProjectId: target.id,
    },
  })
  const locator = await client.locator.create({
    data: {
      id: `locator-${suffix}`,
      name: 'Pay button',
      value: '[data-test="pay"]',
      locatorGroupId: locatorGroup.id,
      targetProjectId: target.id,
    },
  })
  const testCase = await client.testCase.create({
    data: {
      id: `case-${suffix}`,
      title: 'Pay successfully',
      description: 'Completes checkout',
      targetProjectId: target.id,
      tags: { connect: { id: tag.id } },
      steps: {
        create: {
          id: `case-step-${suffix}`,
          collaborationPortableId: 'case-step-one',
          flowNodeId: `case-flow-node-${suffix}`,
          order: 0,
          gherkinStep: 'When the user pays',
          icon: 'MOUSE',
          label: 'Pay',
          invocationJson,
          parameters: {
            create: { name: 'target', value: 'Pay button', type: 'LOCATOR', order: 0, locatorId: locator.id },
          },
        },
      },
      flowBlocks: {
        create: {
          id: `case-block-${suffix}`,
          collaborationPortableId: 'case-block-one',
          name: 'Main',
          order: 0,
          nodes: { create: { flowNodeId: `case-flow-node-${suffix}` } },
        },
      },
    },
  })
  const template = await client.templateTestCase.create({
    data: {
      id: `template-${suffix}`,
      name: 'Payment template',
      description: 'Reusable payment',
      targetProjectId: target.id,
      steps: {
        create: {
          id: `template-step-${suffix}`,
          collaborationPortableId: 'template-step-one',
          flowNodeId: `template-flow-node-${suffix}`,
          order: 0,
          gherkinStep: 'When the user pays',
          icon: 'MOUSE',
          label: 'Pay',
          invocationJson,
          parameters: {
            create: {
              name: 'target',
              defaultValue: 'Pay button',
              type: 'LOCATOR',
              order: 0,
              defaultLocatorId: locator.id,
            },
          },
        },
      },
      flowBlocks: {
        create: {
          id: `template-block-${suffix}`,
          collaborationPortableId: 'template-block-one',
          name: 'Main',
          order: 0,
          nodes: { create: { flowNodeId: `template-flow-node-${suffix}` } },
        },
      },
    },
  })
  const suite = await client.testSuite.create({
    data: {
      id: `suite-${suffix}`,
      name: 'Checkout smoke',
      moduleId: moduleRecord.id,
      targetProjectId: target.id,
      testCases: { connect: { id: testCase.id } },
      tags: { connect: { id: tag.id } },
    },
  })
  await client.collaborationEntityMap.createMany({
    data: [
      { bindingId: binding.id, kind: 'MODULE', portableId: 'module-checkout', localEntityId: moduleRecord.id },
      { bindingId: binding.id, kind: 'TAG', portableId: 'tag-smoke', localEntityId: tag.id },
      {
        bindingId: binding.id,
        kind: 'LOCATOR_GROUP',
        portableId: 'locator-group-checkout',
        localEntityId: locatorGroup.id,
      },
      { bindingId: binding.id, kind: 'LOCATOR', portableId: 'locator-pay', localEntityId: locator.id },
      { bindingId: binding.id, kind: 'TEST_CASE', portableId: 'case-payment', localEntityId: testCase.id },
      { bindingId: binding.id, kind: 'TEMPLATE', portableId: 'template-payment', localEntityId: template.id },
      { bindingId: binding.id, kind: 'TEST_SUITE', portableId: 'suite-checkout', localEntityId: suite.id },
      {
        bindingId: binding.id,
        kind: 'ENVIRONMENT_REFERENCE',
        portableId: 'environment-staging',
        localEntityId: environment.id,
      },
    ],
  })
  return { client, binding, environment }
}

describe('authored collaboration projection', () => {
  it('reconstructs the same portable graph from databases with different local ids and excludes environment secrets', async () => {
    const first = await fixture('a')
    const second = await fixture('b')
    try {
      const [left, right] = await Promise.all([
        projectAuthoredCollaborationSnapshot(first.binding.id, first.client),
        projectAuthoredCollaborationSnapshot(second.binding.id, second.client),
      ])
      expect(left.snapshotHash).toBe(right.snapshotHash)
      expect([...left.files.keys()]).toEqual([...right.files.keys()])
      const environment = left.files.get('environment-references/environment-staging.json')
      expect(environment).toContain('Staging')
      expect(environment).not.toContain('secret.example')
      expect(environment).not.toContain('PASSWORD')

      const policy = await updateCollaborationPolicy(
        {
          bindingId: second.binding.id,
          changes: { INTEGRATE: true },
          trustedPrincipalId: 'local-user',
          provenance: 'authenticated-host',
        },
        second.client,
      )
      await mapCollaborationEnvironment(
        {
          bindingId: second.binding.id,
          portableId: 'environment-staging',
          localEnvironmentId: second.environment.id,
          expectedScopeVersion: second.environment.scopeVersion,
        },
        second.client,
      )
      const records = left.manifest.records.map(entry =>
        collaborationRecordSchema.parse(JSON.parse(left.files.get(entry.path)!) as unknown),
      )
      await applyCollaborationRecords(
        {
          bindingId: second.binding.id,
          records,
          expectedPolicyVersion: policy.policyVersion,
          repositoryRevision: 'source-revision',
        },
        second.client,
      )
      const reconstructed = await projectAuthoredCollaborationSnapshot(second.binding.id, second.client)
      expect(reconstructed.snapshotHash).toBe(left.snapshotHash)
    } finally {
      await Promise.all([first.client.$disconnect(), second.client.$disconnect()])
    }
  })
})
