import { PrismaClient } from '@prisma/client'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect } from 'vitest'
import { hashQualityJourneyExecutionValue as hash, type QualityJourneyRole } from '@/lib/quality-journey'
import {
  admitExternalQualityJourneyWork,
  claimExternalQualityJourneyWork,
  createQualityJourney,
  readExternalQualityJourneySubmissionOutcome,
  revokeQualityJourneyWorkAuthorization,
  type ExternalAnalyzerProjectPrincipal,
} from '@/services/coordinator/quality-journey-service'
import {
  trustedHumanCoordinatorSession,
  type CoordinatorSessionCredentials,
} from '@/services/coordinator/quality-journey-coordinator-session'
import {
  activateQualityJourneyCoordinatorSession,
  registerQualityJourneyCoordinatorSession,
  transferQualityJourneyCoordinatorSession,
} from '@/services/coordinator/quality-journey-session-service'

const principal: ExternalAnalyzerProjectPrincipal = {
  principalId: 'coordinator:managed-specialized-fixture',
  assurance: 'PROJECT_CREDENTIAL_ONLY',
}
type Scope = { journeyId: string; targetProjectId: string }

/** Change schema-valid content, retaining the original assignment and replay key. */
function changedPayload(input: Record<string, unknown>, role: QualityJourneyRole) {
  if (role === 'REQUIREMENT_ANALYZER') {
    const charter = input.charter as { assumptions: string[] }
    return { ...input, charter: { ...charter, assumptions: [...charter.assumptions, 'Changed replay content.'] } }
  }
  if (role === 'SCOUT') {
    const bundle = input.bundle as { observations: Array<{ fact: string }> }
    return {
      ...input,
      bundle: {
        ...bundle,
        observations: bundle.observations.map((value, index) =>
          index === 0 ? { ...value, fact: `${value.fact} Changed replay fact.` } : value,
        ),
      },
    }
  }
  if (role === 'RESOURCE_EXPLORER') {
    const bundle = input.bundle as Record<string, unknown>
    const collection = ['reusable', 'incompatible', 'stale', 'crossTarget', 'missing'].find(
      key => (bundle[key] as unknown[]).length > 0,
    )!
    return {
      ...input,
      bundle: {
        ...bundle,
        [collection]: (bundle[collection] as Array<{ explanation: string }>).map((value, index) =>
          index === 0 ? { ...value, explanation: `${value.explanation} Changed replay resolution.` } : value,
        ),
      },
    }
  }
  if (role === 'TEST_SCENARIO_DESIGNER') {
    const original = input.portfolio as { coverageRationale: string }
    const portfolio = { ...original, coverageRationale: `${original.coverageRationale} Changed replay coverage.` }
    const result = input.result as { outputs: Array<{ kind: string; contentHash: string }> }
    // Keep the strict Designer result self-consistent, so refusal must come
    // from durable idempotency rather than an invalid output hash envelope.
    return {
      ...input,
      portfolio,
      result: {
        ...result,
        outputs: result.outputs.map(output =>
          output.kind === 'SCENARIO_PORTFOLIO_REVISION' ? { ...output, contentHash: hash(portfolio) } : output,
        ),
      },
    }
  }
  if (role === 'AUTOMATOR') {
    const scenarios = input.scenarios as Array<{ steps: Array<{ sourceScenarioStepId: string }> }>
    return {
      ...input,
      scenarios: scenarios.map((scenario, index) =>
        index === 0
          ? {
              ...scenario,
              steps: scenario.steps.map((step, stepIndex) =>
                stepIndex === 0 ? { ...step, sourceScenarioStepId: `${step.sourceScenarioStepId}-changed` } : step,
              ),
            }
          : scenario,
      ),
    }
  }
  const report = input.report as { summary: string }
  return { ...input, report: { ...report, summary: `${report.summary} Changed replay report.` } }
}

async function activate(client: PrismaClient, scope: Scope) {
  const registered = await registerQualityJourneyCoordinatorSession(
    { ...scope, ownerPrincipalId: principal.principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'register' },
    client,
  )
  const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  const activated = await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      authority: trustedHumanCoordinatorSession,
      coordinatorSessionId: registered.session.id,
      coordinatorPrincipalId: principal.principalId,
      requestId: 'activate',
      expectedOwnershipVersion: journey.ownershipVersion,
      expectedStateHash: journey.stateHash,
      approvedBy: 'local-ui',
    },
    client,
  )
  return {
    coordinatorSessionId: activated.coordinatorSessionId,
    coordinatorGeneration: activated.coordinatorGeneration,
    coordinatorPrincipalId: principal.principalId,
  }
}

/** Real SQLite sessions and external admission; no session or service mocks. */
export async function managedSpecializedFixture(client: PrismaClient, scope: Scope) {
  const credentials = await activate(client, scope)
  const foreign = await createQualityJourney(
    {
      targetProjectId: scope.targetProjectId,
      hostingMode: 'APP_SERVER_LOCAL_V1',
      idempotencyKey: 'managed-specialized-foreign',
      requirement: { objective: 'Foreign authority boundary' },
    },
    client,
  )
  const foreignCredentials = await activate(client, { ...scope, journeyId: foreign.journey.journeyId })
  const accepted: Array<{
    operation: string
    role: QualityJourneyRole
    input: Record<string, unknown>
    outcome: unknown
    submit: (
      value: unknown,
      principal: ExternalAnalyzerProjectPrincipal,
      client: PrismaClient,
      session?: CoordinatorSessionCredentials,
    ) => Promise<unknown>
  }> = []
  const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'QualityJourney%' OR name IN ('TestSuite', 'TestCase', 'TestCaseStep', 'RuntimeCapsule')) ORDER BY name`,
  )
  const snapshot = async (reader = client) => {
    const rows: Record<string, unknown> = {}
    for (const { name } of tables) rows[name] = await reader.$queryRawUnsafe(`SELECT * FROM "${name}" ORDER BY rowid`)
    return rows
  }
  type Accepted = (typeof accepted)[number]
  type Snapshot = Awaited<ReturnType<typeof snapshot>>
  const changedInputError = {
    code: 'CONFLICT',
    message: 'External submission idempotency key was reused with different input.',
  }
  async function rejectsUnchanged(
    request: Promise<unknown>,
    before: Snapshot,
    error: { code: string; message?: string },
  ) {
    await expect(request).rejects.toMatchObject(error)
    expect(await snapshot()).toEqual(before)
  }
  async function replayUnchanged(
    value: Accepted,
    reader: PrismaClient,
    session: CoordinatorSessionCredentials | undefined,
    before: Snapshot,
  ) {
    await expect(value.submit(value.input, principal, reader, session)).resolves.toEqual({
      ...(value.outcome as object),
      replayed: true,
    })
    expect(await snapshot()).toEqual(before)
  }
  async function changedReplayRefuses(value: Accepted, before: Snapshot) {
    await rejectsUnchanged(
      value.submit(changedPayload(value.input, value.role), principal, client, credentials),
      before,
      changedInputError,
    )
  }
  async function assertFencedAcceptance(value: Accepted, freshClient: PrismaClient, before: Snapshot) {
    // Exercise the real specialized transaction, not only outcome_get.
    for (const session of [credentials, undefined, foreignCredentials]) {
      await replayUnchanged(value, freshClient, session, before)
    }
    await changedReplayRefuses(value, before)
    const scopeMessages: Partial<Record<QualityJourneyRole, string>> = {
      REQUIREMENT_ANALYZER: 'Analysis charter identity does not match its assignment scope.',
      TEST_SCENARIO_DESIGNER: 'Scenario portfolio scope does not match the leased journey.',
    }
    const scopeMessage = scopeMessages[value.role]
    const invalidBindings = [
      { override: { assignmentSecret: 'wrong-assignment-secret-0123456789' }, error: { code: 'UNAUTHORIZED' } },
      { override: { assignmentGeneration: Number(value.input.assignmentGeneration) + 1 }, error: { code: 'CONFLICT' } },
      {
        override: { targetProjectId: 'foreign-project' },
        error: scopeMessage ? { code: 'CONFLICT', message: scopeMessage } : { code: 'UNAUTHORIZED' },
      },
    ]
    for (const { override, error } of invalidBindings) {
      await rejectsUnchanged(
        value.submit({ ...value.input, ...override }, principal, client, credentials),
        before,
        error,
      )
    }
    await rejectsUnchanged(
      value.submit(value.input, { ...principal, principalId: 'coordinator:foreign' }, client, credentials),
      before,
      { code: 'UNAUTHORIZED' },
    )
    await rejectsUnchanged(
      value.submit(
        { ...value.input, idempotencyKey: `fenced-new:${value.input.idempotencyKey}` },
        principal,
        client,
        credentials,
      ),
      before,
      {
        code: 'UNAUTHORIZED',
        message: 'Coordinator session generation is not current for this Journey and target.',
      },
    )
    const receipt = await readExternalQualityJourneySubmissionOutcome(
      { ...scope, ...value.input, operation: value.operation, role: value.role, principal } as Parameters<
        typeof readExternalQualityJourneySubmissionOutcome
      >[0],
      client,
    )
    expect(receipt).toMatchObject({ outcome: value.outcome })
    expect(await snapshot()).toEqual(before)
  }
  return {
    credentials,
    principal,
    human: trustedHumanCoordinatorSession as typeof trustedHumanCoordinatorSession,
    async claim(role: QualityJourneyRole) {
      const assignmentSecret = `managed-specialized-secret-${role}-0123456789`
      const claim = await claimExternalQualityJourneyWork(
        { ...scope, ...credentials, role, principal, assignmentSecret, idempotencyKey: `claim-${role}` },
        client,
      )
      await admitExternalQualityJourneyWork(
        {
          ...scope,
          ...credentials,
          role,
          principal,
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          assignmentId: claim.assignment.assignmentId,
          assignmentGeneration: claim.assignmentGeneration,
          assignmentSecret,
          leaseId: claim.attempt.leaseId,
          idempotencyKey: `admit-${role}`,
        },
        client,
      )
      return { ...claim, ownerToken: assignmentSecret }
    },
    async write<T>(
      operation: string,
      input: Record<string, unknown> & { attemptId: string; ownerToken: string },
      submit: (
        value: unknown,
        principal: ExternalAnalyzerProjectPrincipal,
        client: PrismaClient,
        session?: CoordinatorSessionCredentials,
      ) => Promise<T>,
    ) {
      const attempt = await client.qualityJourneyWorkAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        include: { workItem: true },
      })
      const { ownerToken, ...value } = input
      const external = {
        ...value,
        assignmentId: attempt.assignmentId,
        assignmentGeneration: attempt.assignmentGeneration,
        assignmentSecret: ownerToken,
      }
      // A genuine SQLite snapshot isolates permanent canonical revocation from
      // the successful lifecycle. Never rewind append-only revocation history.
      const directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-role-revocation-'))
      const databasePath = path.join(directory, 'revoked.db')
      let revokedClient: PrismaClient | undefined
      try {
        await client.$executeRawUnsafe('VACUUM INTO ?', databasePath)
        revokedClient = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
        await revokeQualityJourneyWorkAuthorization(
          {
            ...scope,
            ...credentials,
            workItemId: attempt.workItemId,
            actor: 'USER',
            reason: 'Live role submission revocation probe.',
          },
          revokedClient,
        )
        expect(
          await revokedClient.qualityJourneyWorkAuthorization.findUniqueOrThrow({
            where: { id: attempt.authorizationId! },
          }),
        ).toMatchObject({ revokedAt: expect.any(Date) })
        const revoked = await snapshot(revokedClient)
        await expect(submit(external, principal, revokedClient, credentials)).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'External work submission authority is not current.',
        })
        expect(await snapshot(revokedClient)).toEqual(revoked)
      } finally {
        await revokedClient?.$disconnect()
        await rm(directory, { recursive: true, force: true })
      }
      const before = await snapshot()
      for (const session of [
        undefined,
        { ...credentials, coordinatorGeneration: credentials.coordinatorGeneration - 1 },
        foreignCredentials,
      ]) {
        await expect(submit(external, principal, client, session)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        expect(await snapshot()).toEqual(before)
      }
      // Advance the mutable assignment generation while retaining its immutable
      // session binding: authentication passes, association validation must fail.
      await client.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { assignmentGeneration: attempt.assignmentGeneration + 1 },
      })
      const mismatched = await snapshot()
      await expect(
        submit({ ...external, assignmentGeneration: attempt.assignmentGeneration + 1 }, principal, client, credentials),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await snapshot()).toEqual(mismatched)
      await client.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { assignmentGeneration: attempt.assignmentGeneration },
      })
      const outcome = await submit(external, principal, client, credentials)
      const receipt = await client.qualityJourneyExternalSubmissionAcceptance.findFirstOrThrow({
        where: { journeyId: scope.journeyId, attemptId: attempt.id, operation },
      })
      expect(JSON.parse(receipt.outcomeJson)).toEqual(expect.objectContaining({ replayed: false }))
      expect(await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
        status: 'COMPLETED',
      })
      accepted.push({
        operation,
        role: attempt.workItem.role,
        input: external,
        submit,
        outcome: JSON.parse(receipt.outcomeJson),
      })
      return outcome
    },
    async fenceAndReadAccepted(expectedOperations: string[]) {
      expect(accepted.map(value => value.operation).sort()).toEqual([...expectedOperations].sort())
      // Canonical revocation is permanent here: all role artifacts have already
      // committed, and no later stage relies on these authorizations.
      for (const value of accepted) {
        const attempt = await client.qualityJourneyWorkAttempt.findUniqueOrThrow({
          where: { id: value.input.attemptId as string },
        })
        await revokeQualityJourneyWorkAuthorization(
          {
            ...scope,
            ...credentials,
            workItemId: value.input.workItemId as string,
            actor: 'USER',
            reason: 'Accepted replay must survive canonical revocation.',
          },
          client,
        )
        expect(
          await client.qualityJourneyWorkAuthorization.findUniqueOrThrow({ where: { id: attempt.authorizationId! } }),
        ).toMatchObject({ revokedAt: expect.any(Date) })
        const before = await snapshot()
        await replayUnchanged(value, client, credentials, before)
        await changedReplayRefuses(value, before)
        await rejectsUnchanged(
          value.submit(
            { ...value.input, idempotencyKey: `revoked-new:${value.input.idempotencyKey}` },
            principal,
            client,
            credentials,
          ),
          before,
          { code: 'UNAUTHORIZED', message: 'External work submission authority is not current.' },
        )
      }
      const successor = await registerQualityJourneyCoordinatorSession(
        {
          ...scope,
          ownerPrincipalId: principal.principalId,
          hostKind: 'APP_SERVER_LOCAL_V1',
          idempotencyKey: 'successor',
        },
        client,
      )
      const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
      await transferQualityJourneyCoordinatorSession(
        {
          ...scope,
          authority: trustedHumanCoordinatorSession,
          coordinatorPrincipalId: principal.principalId,
          requestId: 'transfer-after-acceptance',
          expectedOwnershipVersion: journey.ownershipVersion,
          expectedStateHash: journey.stateHash,
          approvedBy: 'local-ui',
          successorSessionId: successor.session.id,
          predecessorSessionId: credentials.coordinatorSessionId,
          predecessorGeneration: credentials.coordinatorGeneration,
          reconciliationReceiptId: 'fixture-quiescent-completed-work',
        },
        client,
      )
      expect(
        await client.qualityJourneyCoordinatorSession.findUniqueOrThrow({
          where: { id: credentials.coordinatorSessionId },
        }),
      ).toMatchObject({ status: 'FENCED' })
      const databases = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
      const databasePath = databases.find(database => database.name === 'main')!.file
      const freshClient = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
      const before = await snapshot()
      try {
        for (const value of accepted) await assertFencedAcceptance(value, freshClient, before)
        expect(await snapshot()).toEqual(before)
      } finally {
        await freshClient.$disconnect()
      }
    },
  }
}
