import type { PrismaClient } from '@prisma/client'
import { expect } from 'vitest'
import type { QualityJourneyRole } from '@/lib/quality-journey'
import {
  admitExternalQualityJourneyWork,
  claimExternalQualityJourneyWork,
  createQualityJourney,
  readExternalQualityJourneySubmissionOutcome,
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
  const snapshot = async () => {
    const rows: Record<string, unknown> = {}
    for (const { name } of tables) rows[name] = await client.$queryRawUnsafe(`SELECT * FROM "${name}" ORDER BY rowid`)
    return rows
  }
  return {
    credentials,
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
      const before = await snapshot()
      for (const value of accepted) {
        await expect(
          value.submit(
            { ...value.input, idempotencyKey: `fenced-new:${value.input.idempotencyKey}` },
            principal,
            client,
            credentials,
          ),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        expect(await snapshot()).toEqual(before)
        const receipt = await readExternalQualityJourneySubmissionOutcome(
          { ...scope, ...value.input, operation: value.operation, role: value.role, principal } as Parameters<
            typeof readExternalQualityJourneySubmissionOutcome
          >[0],
          client,
        )
        expect(receipt).toMatchObject({ outcome: value.outcome })
      }
      expect(await snapshot()).toEqual(before)
    },
  }
}
