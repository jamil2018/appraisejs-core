import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { createQualityJourneyKernelState, hashQualityJourneyExecutionValue } from '@/lib/quality-journey'
import { preparedRuntimeCapsuleSchema } from '@/lib/quality-journey/automation-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { hashRuntimeCapsuleValue } from '@/lib/runtime-capsule/contracts'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import { createQualityJourney } from '@/services/coordinator/quality-journey-service'
import {
  activateQualityJourneyCoordinatorSession,
  registerQualityJourneyCoordinatorSession,
} from '@/services/coordinator/quality-journey-session-service'
import { createTargetProjectFixture } from '@/test/migrated-test-database'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  computeStepReferenceHash,
  stepDefinitionContentHash,
} from '../../packages/cucumber-runtime/src/step-definitions/index.ts'

const digest = (character: string) => `sha256:${character.repeat(64)}`
const json = JSON.stringify

function executionResourceHashes(
  realRuntime: boolean,
  legacyResourceHashes: boolean,
  definition: (typeof builtInStepDefinitions)[number],
  operation: (typeof defaultOperationDefinitions)[number],
) {
  const definitionHashes = computeStepDefinitionHashes(definition)
  const resourceHashes = realRuntime
    ? [
        {
          id: `step:${definition.identity.id}:${definition.identity.version}`,
          contentHash: definitionHashes.definitionHash,
        },
        {
          id: `operation:${operation.id}:${operation.version}`,
          contentHash: hashQualityJourneyExecutionValue(operation),
        },
      ].map(resource =>
        legacyResourceHashes
          ? {
              ...resource,
              kind: resource.id.startsWith('step:') ? ('STEP_DEFINITION' as const) : ('OPERATION' as const),
              sourceTargetProjectId: null,
            }
          : resource,
      )
    : []
  return resourceHashes
}

/**
 * Seeds the frozen Automation output consumed by the Phase 7 runner in a
 * migrated disposable database. Use a Prisma connection_limit of one.
 */
export async function seedPreparedJourneyExecution(
  client: PrismaClient,
  workspace: string,
  {
    actualOperationId = 'browser.forms.fill',
    manifestOperationId = actualOperationId,
    capsuleCount = 1,
    realRuntime = false,
    baseUrl = 'http://127.0.0.1:3000',
    legacyResourceHashes = false,
    legacyBareStep = false,
    label = 'execution',
    managed = false,
    checkoutFailure = false,
    fixtureSuffix = '',
  }: {
    actualOperationId?: string
    manifestOperationId?: string
    capsuleCount?: number
    realRuntime?: boolean
    baseUrl?: string
    legacyResourceHashes?: boolean
    legacyBareStep?: boolean
    label?: string
    managed?: boolean
    checkoutFailure?: boolean
    fixtureSuffix?: string
  } = {},
) {
  if (fixtureSuffix && capsuleCount !== 1) throw new Error('Scoped fixture supports one prepared capsule.')
  const fixtureId = (value: string) => (fixtureSuffix ? `${value}-${fixtureSuffix}` : value)
  await createTargetProjectFixture(client, {
    id: fixtureId('target-execution'),
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${workspace}`,
    canonicalPath: workspace,
    displayName: label,
    fingerprint: digest(fixtureSuffix ? 'b' : 'a'),
  })
  await client.environment.create({
    data: {
      id: fixtureId('environment-execution'),
      targetProjectId: fixtureId('target-execution'),
      name: 'local',
      baseUrl,
    },
  })
  await client.module.create({
    data: { id: fixtureId('module-execution'), targetProjectId: fixtureId('target-execution'), name: 'module' },
  })
  await client.testSuite.create({
    data: {
      id: fixtureId('suite-execution'),
      targetProjectId: fixtureId('target-execution'),
      moduleId: fixtureId('module-execution'),
      name: 'suite',
    },
  })
  await client.testCase.create({
    data: {
      id: fixtureId('case-execution'),
      targetProjectId: fixtureId('target-execution'),
      title: label === 'execution' ? 'case' : label,
      description: 'case',
      TestSuite: { connect: { id: fixtureId('suite-execution') } },
    },
  })
  const confirmationLocator = checkoutFailure
    ? await client.locatorGroup
        .create({
          data: {
            id: fixtureId('checkout-confirmation-group'),
            targetProjectId: fixtureId('target-execution'),
            moduleId: fixtureId('module-execution'),
            name: 'Checkout confirmation',
            route: '/checkout',
          },
        })
        .then(group =>
          client.locator.create({
            data: {
              id: fixtureId('checkout-confirmation'),
              targetProjectId: fixtureId('target-execution'),
              locatorGroupId: group.id,
              name: 'confirmation',
              value: '#confirmation',
            },
          }),
        )
    : null
  const created = await createQualityJourney(
    {
      targetProjectId: fixtureId('target-execution'),
      idempotencyKey: fixtureId('journey-create'),
      requirement: { objective: label === 'execution' ? 'exercise phase seven' : label },
      ...(managed ? { hostingMode: 'APP_SERVER_LOCAL_V1' as const } : {}),
    },
    client,
  )
  const session =
    managed && realRuntime ? await activateFixtureSession(client, created, fixtureId('target-execution')) : null
  const state = createQualityJourneyKernelState({
    journeyId: created.journey.journeyId,
    targetProjectId: fixtureId('target-execution'),
    activeCycleId: created.journey.activeCycleId,
    stage: 'AUTOMATION',
  })
  // Phase 6's relational antecedents are already tested in their own suite.
  // This uses a migrated SQLite database to seed the smallest frozen output
  // packet consumed by the Phase 7 coordinator boundary.
  await client.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
  await client.qualityJourney.update({
    where: { id: created.journey.journeyId },
    data: {
      stage: 'AUTOMATION',
      stateHash: state.stateHash,
      activeScenarioPortfolioRevisionId: fixtureId('portfolio-execution'),
    },
  })
  await client.qualityJourneyScenarioPortfolioRevision.create({
    data: {
      id: fixtureId('portfolio-execution'),
      journeyId: created.journey.journeyId,
      targetProjectId: fixtureId('target-execution'),
      cycleId: created.journey.activeCycleId,
      discoveryRevisionId: 'discovery-missing',
      discoveryCompletionHash: digest('b'),
      artifactRecordId: fixtureId('artifact-portfolio'),
      artifactId: 'portfolio',
      artifactRevisionId: fixtureId('portfolio-r1'),
      revision: 1,
      contentHash: digest('c'),
      behavioralIntentHash: digest('d'),
      enrichmentHash: digest('e'),
      layoutHash: digest('f'),
      coverageRationale: 'scope',
      graphJson: '{}',
      submissionIdempotencyKey: fixtureId('portfolio-submit'),
      submissionHash: digest('1'),
      submittedWorkItemId: fixtureId('work-missing'),
      submittedAttemptId: fixtureId('attempt-missing'),
      status: 'APPROVED',
      approvedIntentHash: digest('2'),
    },
  })
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: fixtureId('scenario-row'),
      portfolioRevisionId: fixtureId('portfolio-execution'),
      stableScenarioId: fixtureId('scenario-stable'),
      scenarioRevisionId: fixtureId('scenario-r1'),
      behavioralIntentJson: label === 'execution' ? '{}' : json({ title: label }),
      behavioralIntentHash: digest('3'),
      enrichmentJson: '{}',
      enrichmentHash: digest('4'),
      layoutJson: '{}',
      layoutHash: digest('5'),
      contentHash: digest('6'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: fixtureId('decision-execution'),
      portfolioRevisionId: fixtureId('portfolio-execution'),
      scenarioRevisionId: fixtureId('scenario-r1'),
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: fixtureId('decision-execution'),
      requestHash: digest('7'),
      contentHash: digest('8'),
    },
  })
  await client.qualityJourneyAutomationMaterialization.create({
    data: {
      id: fixtureId('materialization-execution'),
      journeyId: created.journey.journeyId,
      targetProjectId: fixtureId('target-execution'),
      cycleId: created.journey.activeCycleId,
      scenarioRevisionId: fixtureId('scenario-r1'),
      scenarioContentHash: digest('6'),
      portfolioRevisionId: fixtureId('portfolio-r1'),
      portfolioRecordId: fixtureId('portfolio-execution'),
      portfolioContentHash: digest('c'),
      decisionId: fixtureId('decision-execution'),
      decisionHash: digest('8'),
      workItemId: fixtureId('work-missing'),
      attemptId: fixtureId('attempt-missing'),
      leaseId: fixtureId('lease'),
      ownerTokenHash: digest('9'),
      inputHash: digest('a'),
      idempotencyKey: fixtureId('materialization'),
      requestHash: digest('b'),
      materializationHash: digest('c'),
      artifactRecordId: fixtureId('artifact-materialization'),
      artifactJson: '{}',
    },
  })
  const operation = defaultOperationDefinitions.find(item => item.id === actualOperationId && item.version === '1')!
  const definition = builtInStepDefinitions.find(
    item =>
      item.execution.kind === 'operation' &&
      item.execution.handlerId === operation.handler.id &&
      item.execution.handlerVersion === operation.handler.version,
  )!
  const definitionHashes = computeStepDefinitionHashes(definition)
  const registryManifestHash = stepDefinitionContentHash({ step: definition.identity })
  const publicationReceipt = {
    step: { id: definition.identity.id, version: definition.identity.version },
    ...definitionHashes,
    registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, 'c26-bounded-runtime'),
    conformanceRunId: 'c26-bounded-runtime',
    reviewAuthority: 'fixture-reviewer',
    publishedAt: '2026-09-29T00:00:00.000Z',
  }
  await client.stepDefinition.upsert({
    where: { id_version: { id: definition.identity.id, version: definition.identity.version } },
    update: {},
    create: {
      id: definition.identity.id,
      version: definition.identity.version,
      status: 'ready',
      title: definition.intent.title,
      description: definition.intent.description,
      definitionJson: json(definition),
      definitionHash: definitionHashes.definitionHash,
      humanProjectionHash: definitionHashes.humanProjectionHash,
      ...(realRuntime ? { agentContractHash: definitionHashes.agentContractHash } : {}),
      executionHash: definitionHashes.executionHash,
      provenanceJson: json(definition.provenance),
      ...(realRuntime
        ? {
            publicationReceipt: {
              create: {
                receiptJson: json(publicationReceipt),
                receiptHash: stepDefinitionContentHash(publicationReceipt),
                registryManifestHash,
                conformanceRunId: 'c26-bounded-runtime',
                reviewAuthority: 'fixture-reviewer',
              },
            },
          }
        : {}),
    },
  })
  const confirmationOperation = checkoutFailure
    ? defaultOperationDefinitions.find(item => item.id === 'browser.assertions.text' && item.version === '1')!
    : null
  const confirmationDefinition = confirmationOperation
    ? builtInStepDefinitions.find(
        item =>
          item.execution.kind === 'operation' &&
          item.execution.handlerId === confirmationOperation.handler.id &&
          item.execution.handlerVersion === confirmationOperation.handler.version,
      )!
    : null
  if (confirmationDefinition) {
    const hashes = computeStepDefinitionHashes(confirmationDefinition)
    const registryHash = stepDefinitionContentHash({ step: confirmationDefinition.identity })
    const receipt = {
      step: { id: confirmationDefinition.identity.id, version: confirmationDefinition.identity.version },
      ...hashes,
      registryManifestHash: registryHash,
      executableReadiness: computeStepExecutableReadiness(confirmationDefinition, registryHash, 'c26-bounded-runtime'),
      conformanceRunId: 'c26-bounded-runtime',
      reviewAuthority: 'fixture-reviewer',
      publishedAt: '2026-09-29T00:00:00.000Z',
    }
    await client.stepDefinition.create({
      data: {
        id: confirmationDefinition.identity.id,
        version: confirmationDefinition.identity.version,
        status: 'ready',
        title: confirmationDefinition.intent.title,
        description: confirmationDefinition.intent.description,
        definitionJson: json(confirmationDefinition),
        definitionHash: hashes.definitionHash,
        humanProjectionHash: hashes.humanProjectionHash,
        agentContractHash: hashes.agentContractHash,
        executionHash: hashes.executionHash,
        provenanceJson: json(confirmationDefinition.provenance),
        publicationReceipt: {
          create: {
            receiptJson: json(receipt),
            receiptHash: stepDefinitionContentHash(receipt),
            registryManifestHash: registryHash,
            conformanceRunId: 'c26-bounded-runtime',
            reviewAuthority: 'fixture-reviewer',
          },
        },
      },
    })
  }
  const invocation = canonicalStepDefinitionJson({
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs: {},
    presentation: { keyword: realRuntime ? 'Given' : 'Then', description: definition.intent.description },
  })
  const binding = {
    schemaVersion: 'appraise.quality-journey/v1',
    targetProjectId: fixtureId('target-execution'),
    moduleId: fixtureId('module-execution'),
    suite: { id: fixtureId('suite-execution'), name: 'suite', description: null },
    testCase: {
      id: fixtureId('case-execution'),
      title: label === 'execution' ? 'case' : label,
      description: 'case',
      steps: [
        {
          ...(realRuntime
            ? {
                order: 0,
                gherkinStep: legacyBareStep
                  ? operation.humanProjections[0]!.signature
                  : `Given ${operation.humanProjections[0]!.signature}`,
                label: operation.title,
                icon: 'NAVIGATION',
              }
            : {}),
          invocationJson: invocation,
        },
        ...(confirmationDefinition && confirmationLocator
          ? [
              {
                order: 1,
                gherkinStep: 'Then the "confirmation" element should contain the text "Order number:"',
                label: 'Order confirmation includes an order number',
                icon: 'VALIDATION',
                invocationJson: canonicalStepDefinitionJson({
                  step: {
                    id: confirmationDefinition.identity.id,
                    version: confirmationDefinition.identity.version,
                    definitionHash: computeStepReferenceHash(confirmationDefinition),
                  },
                  inputs: { target: confirmationLocator.id, text: 'Order number:' },
                  presentation: {
                    keyword: 'Then',
                    description: 'Order confirmation includes an order number',
                  },
                }),
              },
            ]
          : []),
      ],
    },
  }
  const resourceHashes = executionResourceHashes(realRuntime, legacyResourceHashes, definition, operation)
  if (confirmationDefinition && confirmationOperation && confirmationLocator) {
    resourceHashes.push(...executionResourceHashes(true, false, confirmationDefinition, confirmationOperation), {
      id: `locator:${confirmationLocator.id}`,
      contentHash: hashRuntimeCapsuleValue({
        id: confirmationLocator.id,
        value: confirmationLocator.value,
        updatedAt: confirmationLocator.updatedAt,
        targetProjectId: confirmationLocator.targetProjectId,
      }),
    })
  }
  await client.qualityJourneyAutomationTargetBinding.create({
    data: {
      id: fixtureId('binding-execution'),
      journeyId: created.journey.journeyId,
      targetProjectId: fixtureId('target-execution'),
      semanticHash: digest('d'),
      suiteId: fixtureId('suite-execution'),
      testCaseId: fixtureId('case-execution'),
      suiteHash: digest('e'),
      testCaseHash: digest('f'),
      stepHash: digest('1'),
      bindingJson: json(binding),
      resourceHashJson: json(resourceHashes),
    },
  })
  await client.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId: fixtureId('materialization-execution'), bindingId: fixtureId('binding-execution') },
  })
  const manifest = {
    schemaVersion: 'appraise.quality-journey/v1',
    testCaseId: fixtureId('case-execution'),
    suiteId: fixtureId('suite-execution'),
    steps: [
      { operation: { id: manifestOperationId, version: '1' }, locatorRequirements: [] },
      ...(confirmationOperation && confirmationLocator
        ? [
            {
              operation: { id: confirmationOperation.id, version: '1' },
              locatorRequirements: [
                {
                  requirementId: fixtureId('checkout-confirmation-requirement'),
                  parameterName: 'target',
                  locatorId: confirmationLocator.id,
                },
              ],
            },
          ]
        : []),
    ],
    // Materialized manifests have always frozen locator requirements, including
    // legacy resource metadata; this operation needs no supplemental selectors.
    locatorRequirements: confirmationLocator
      ? [
          {
            requirementId: fixtureId('checkout-confirmation-requirement'),
            parameterName: 'target',
            locatorId: confirmationLocator.id,
          },
        ]
      : [],
  }
  const manifestHash = hashQualityJourneyExecutionValue(manifest)
  const capsuleHash = realRuntime
    ? hashQualityJourneyExecutionValue(
        preparedRuntimeCapsuleSchema.parse({
          schemaVersion: 'appraise.quality-journey/v1',
          capsuleId: fixtureId('prepared-execution'),
          journeyId: created.journey.journeyId,
          targetProjectId: fixtureId('target-execution'),
          cycleId: created.journey.activeCycleId,
          materializationId: fixtureId('materialization-execution'),
          inputHash: digest('a'),
          manifestHash,
          status: 'PREPARED',
        }),
      )
    : digest('b')
  await client.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: fixtureId('prepared-execution'),
      journeyId: created.journey.journeyId,
      targetProjectId: fixtureId('target-execution'),
      cycleId: created.journey.activeCycleId,
      materializationId: fixtureId('materialization-execution'),
      inputHash: digest('a'),
      capsuleHash,
      manifestJson: canonicalContractJson(manifest),
      manifestHash,
    },
  })
  if (capsuleCount === 2) {
    await seedSecondPreparedCapsule(client, created.journey.journeyId, created.journey.activeCycleId, manifest)
  }
  await client.$executeRawUnsafe('PRAGMA foreign_keys=ON')
  if (realRuntime)
    await seedRetainedProducerLineage(
      client,
      session,
      fixtureId('materialization-execution'),
      fixtureId('legacy-automator-authorization'),
    )
  return {
    journeyId: created.journey.journeyId,
    targetProjectId: fixtureId('target-execution'),
    testCaseId: fixtureId('case-execution'),
    stateHash: state.stateHash,
    cycleId: created.journey.activeCycleId,
    preparedRuntimeCapsuleIds:
      capsuleCount === 2
        ? [fixtureId('prepared-execution'), 'prepared-execution-2']
        : [fixtureId('prepared-execution')],
  }
}

async function seedSecondPreparedCapsule(client: PrismaClient, journeyId: string, cycleId: string, manifest: unknown) {
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: 'scenario-row-2',
      portfolioRevisionId: 'portfolio-execution',
      stableScenarioId: 'scenario-stable-2',
      scenarioRevisionId: 'scenario-r2',
      behavioralIntentJson: '{}',
      behavioralIntentHash: digest('4'),
      enrichmentJson: '{}',
      enrichmentHash: digest('5'),
      layoutJson: '{}',
      layoutHash: digest('6'),
      contentHash: digest('7'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: 'decision-execution-2',
      portfolioRevisionId: 'portfolio-execution',
      scenarioRevisionId: 'scenario-r2',
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: 'decision-execution-2',
      requestHash: digest('8'),
      contentHash: digest('9'),
    },
  })
  await client.qualityJourneyAutomationMaterialization.create({
    data: {
      id: 'materialization-execution-2',
      journeyId,
      targetProjectId: 'target-execution',
      cycleId,
      scenarioRevisionId: 'scenario-r2',
      scenarioContentHash: digest('7'),
      portfolioRevisionId: 'portfolio-r1',
      portfolioRecordId: 'portfolio-execution',
      portfolioContentHash: digest('c'),
      decisionId: 'decision-execution-2',
      decisionHash: digest('9'),
      workItemId: 'work-missing-2',
      attemptId: 'attempt-missing-2',
      leaseId: 'lease-2',
      ownerTokenHash: digest('a'),
      inputHash: digest('b'),
      idempotencyKey: 'materialization-2',
      requestHash: digest('c'),
      materializationHash: digest('d'),
      artifactRecordId: 'artifact-materialization-2',
      artifactJson: '{}',
    },
  })
  await client.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId: 'materialization-execution-2', bindingId: 'binding-execution' },
  })
  await client.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: 'prepared-execution-2',
      journeyId,
      targetProjectId: 'target-execution',
      cycleId,
      materializationId: 'materialization-execution-2',
      inputHash: digest('b'),
      capsuleHash: digest('c'),
      manifestJson: canonicalContractJson(manifest),
      manifestHash: hashQualityJourneyExecutionValue(manifest),
    },
  })
}

async function activateFixtureSession(
  client: PrismaClient,
  created: Awaited<ReturnType<typeof createQualityJourney>>,
  targetProjectId: string,
) {
  const scope = { journeyId: created.journey.journeyId, targetProjectId }
  const principalId = 'project:disposable-checkout'
  const registered = await registerQualityJourneyCoordinatorSession(
    { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'checkout-session' },
    client,
  )
  await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      coordinatorPrincipalId: principalId,
      coordinatorSessionId: registered.session.id,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      requestId: 'checkout-activate',
      expectedOwnershipVersion: 0,
      expectedStateHash: created.journey.stateHash,
    },
    client,
  )
  return { sessionId: registered.session.id, coordinatorGeneration: 1 }
}

/** Supply the retained Automator lineage that the real runner validates before launch. */
async function seedRetainedProducerLineage(
  client: PrismaClient,
  session: Awaited<ReturnType<typeof activateFixtureSession>> | null,
  materializationId = 'materialization-execution',
  authorizationId = 'legacy-automator-authorization',
) {
  await client.$transaction(async tx => {
    const materialization = await tx.qualityJourneyAutomationMaterialization.findUniqueOrThrow({
      where: { id: materializationId },
    })
    const { journeyId, targetProjectId, cycleId, workItemId, attemptId, leaseId, inputHash } = materialization
    const role = 'AUTOMATOR'
    const roleContractDigest = digest('d')
    await tx.qualityJourneyWorkItem.create({
      data: {
        id: workItemId,
        journeyId,
        targetProjectId,
        cycleId,
        role,
        status: 'COMPLETED',
        currentAttempt: 1,
        inputHash,
        roleContractDigest,
      },
    })
    await tx.qualityJourneyWorkAuthorization.create({
      data: {
        id: authorizationId,
        journeyId,
        targetProjectId,
        workItemId,
        role,
        roleContractDigest,
        capabilityProfileId: 'legacy-automator-profile',
        capabilityProfileHash: digest('e'),
        authorizationJson: '{}',
        authorizationHash: hashQualityJourneyExecutionValue({}),
      },
    })
    const startedAt = new Date('2026-09-05T00:00:00.000Z')
    const completedAt = new Date('2026-09-05T00:00:30.000Z')
    await tx.qualityJourneyWorkAttempt.create({
      data: {
        id: attemptId,
        workItemId,
        attempt: 1,
        status: 'COMPLETED',
        leaseId,
        ownerTokenHash: materialization.ownerTokenHash,
        leaseExpiresAt: new Date('2026-09-05T00:01:00.000Z'),
        heartbeatSeconds: 30,
        authorizationId,
        startedAt,
        completedAt,
      },
    })
    await tx.qualityJourneyWorkAttemptSessionBinding.create({
      data: {
        attemptId,
        journeyId,
        targetProjectId,
        assignmentGeneration: 1,
        workItemId,
        role,
        authorizationId,
        leaseId,
        inputHash,
        ...(session ?? {}),
        provenance: session ? 'CLAIM_SESSION_V1' : 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1',
      },
    })
  })
}
