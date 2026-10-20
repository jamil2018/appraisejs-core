/**
 * Disposable, in-process canonical acceptance fixture for M02-TA T0.
 *
 * The six role rows are synthetic assignments. Their effect is a synthetic
 * artifact, not a role-specific Journey transition. The authority check,
 * transaction-local acceptance, durable replay and outcome lookup are the
 * production services. No listener, child, Prisma CLI or real database is used.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { lstat, mkdtemp, open, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { PrismaClient, type QualityJourneyRole } from '@prisma/client'
import { canonicalContractJson } from '../../../../src/lib/catalog-contracts'
import type {
  ExternalWorkerBinding,
  FrozenWorkerRead,
} from '../../../../packages/appraisejs/src/mcp/external-worker-gateway'

// The current @types/node omits node:sqlite even though the pinned Node 26
// runtime provides it. Resolve the built-in at runtime without spawning it.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void
    prepare(sql: string): { run(...values: string[]): unknown }
    close(): void
  }
}

export const canonicalOperations = Object.freeze({
  REQUIREMENT_ANALYZER: 'ANALYSIS_SUBMIT',
  SCOUT: 'TARGET_OBSERVATION_SUBMIT',
  RESOURCE_EXPLORER: 'RESOURCE_RESOLUTION_SUBMIT',
  TEST_SCENARIO_DESIGNER: 'SCENARIO_PORTFOLIO_SUBMIT',
  AUTOMATOR: 'AUTOMATION_MATERIALIZE',
  TRIAGER: 'TRIAGE_REPORT_SUBMIT',
} satisfies Record<QualityJourneyRole, string>)

type Services = typeof import('../../../../src/services/coordinator/quality-journey-service')
type Binding =
  import('../../../../src/services/coordinator/quality-journey-service').ExternalQualityJourneySubmissionBinding

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error('Fixture accepts JSON values only.')
  return result
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
const serviceDigest = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

/** Apply the repository's current checked-in SQL, in this process only. */
function createCurrentSchema(databasePath: string): void {
  const migrationsDir = resolve(process.cwd(), 'prisma/migrations')
  const db = new DatabaseSync(databasePath)
  try {
    db.exec(`CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL,
      "finished_at" DATETIME, "migration_name" TEXT NOT NULL, "logs" TEXT,
      "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0)`)
    const insert = db.prepare(`INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, applied_steps_count)
      VALUES (?, ?, current_timestamp, ?, NULL, NULL, 1)`)
    for (const entry of readdirSync(migrationsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sqlPath = join(migrationsDir, entry.name, 'migration.sql')
      if (!existsSync(sqlPath)) continue
      const sql = readFileSync(sqlPath, 'utf8')
      db.exec('BEGIN')
      try {
        db.exec(sql)
        insert.run(randomUUID(), createHash('sha256').update(sql).digest('hex'), entry.name)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  } finally {
    db.close()
  }
}

const approvedPhaseRoots = [
  '/private/tmp/appraise-m02-ta-descriptors-p1',
  '/private/tmp/appraise-m02-ta-matrix-p1',
  '/private/tmp/appraise-m02-ta-workspace-p1',
]

async function assertOwnedSupervisorWorkspace(workspace: string) {
  if (!workspace.startsWith('/') || resolve(workspace) !== workspace || (await realpath(workspace)) !== workspace)
    throw new Error('Canonical fixture workspace must be an exact real path.')
  const root = approvedPhaseRoots.find(candidate => {
    const parts = relative(candidate, workspace).split(sep)
    return (
      parts.length === 3 &&
      parts[0] === 'cases' &&
      /^[A-Za-z0-9._:-]{1,200}$/.test(parts[1]) &&
      parts[2] === 'supervisor'
    )
  })
  if (!root) throw new Error('Canonical fixture workspace is outside an exact case supervisor directory.')
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('Canonical fixture owner is unavailable.')
  for (const current of [root, join(root, 'cases'), dirname(workspace), workspace]) {
    const state = await lstat(current)
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== uid || (state.mode & 0o777) !== 0o700)
      throw new Error('Canonical fixture ancestry is not owned 0700.')
  }
}

export async function createCanonicalAcceptanceFixture(
  role: QualityJourneyRole,
  options?: { workspace: string; cleanupOnClose: false },
) {
  if (options && options.cleanupOnClose !== false)
    throw new Error('Runtime canonical fixture must retain its workspace.')
  const workspace = options?.workspace ?? (await mkdtemp(join(tmpdir(), 'appraise-m02-ta-canonical-')))
  if (options) await assertOwnedSupervisorWorkspace(workspace)
  const cleanupOnClose = !options
  const databasePath = join(workspace, 'fixture.db')
  let client: PrismaClient | undefined
  try {
    const handle = await open(databasePath, 'wx', 0o600)
    try {
      await handle.chmod(0o600)
    } finally {
      await handle.close()
    }
    createCurrentSchema(databasePath)
    client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    // Service imports construct a default client. Keep that idle client pointed
    // at this disposable database even though every call below passes `client`.
    const previousUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = `file:${databasePath}`
    let services: Services
    try {
      services = await import('../../../../src/services/coordinator/quality-journey-service')
    } finally {
      if (previousUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousUrl
    }
    const id = randomUUID().replaceAll('-', '')
    const targetProjectId = `target_${id}`
    const journeyId = `journey_${id}`
    const cycleId = `cycle_${id}`
    const workItemId = `work_${id}`
    const attemptId = `attempt_${id}`
    const authorizationId = `auth_${id}`
    const assignmentId = `assignment_${id}`
    const leaseId = `lease_${id}`
    const secret = `fixture-secret-${id}`
    const principal = { principalId: `fixture-principal-${id}`, assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
    const inputHash = digest({ id, role })
    await client.targetProject.create({
      data: {
        id: targetProjectId,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${workspace}`,
        canonicalPath: workspace,
        displayName: 'Disposable M02 acceptance',
        fingerprint: digest(workspace),
      },
    })
    await client.qualityJourney.create({
      data: {
        id: journeyId,
        targetProjectId,
        rootIdempotencyKey: `fixture-${id}`,
        rootRequestHash: inputHash,
        activeCycleId: cycleId,
        stateHash: inputHash,
      },
    })
    await client.qualityJourneyCycle.create({ data: { id: cycleId, journeyId, sequence: 1 } })
    await client.qualityJourneyWorkItem.create({
      data: {
        id: workItemId,
        journeyId,
        targetProjectId,
        cycleId,
        role,
        status: 'IN_PROGRESS',
        inputHash,
        roleContractDigest: digest(role),
        currentAttempt: 1,
      },
    })
    await client.qualityJourneyWorkAuthorization.create({
      data: {
        id: authorizationId,
        journeyId,
        targetProjectId,
        workItemId,
        role,
        roleContractDigest: digest(role),
        capabilityProfileId: `profile_${id}`,
        capabilityProfileHash: digest('profile'),
        authorizationJson: '{}',
        authorizationHash: digest({}),
        externalAdmissionProtocol: 'EXTERNAL_V1',
        externalPrincipalId: principal.principalId,
        externalPrincipalAssurance: principal.assurance,
      },
    })
    await client.qualityJourneyWorkAttempt.create({
      data: {
        id: attemptId,
        workItemId,
        attempt: 1,
        status: 'IN_PROGRESS',
        leaseId,
        ownerTokenHash: services.externalAssignmentSecretHash(secret),
        executionMode: 'EXTERNAL_V1',
        externalPrincipalId: principal.principalId,
        externalPrincipalAssurance: principal.assurance,
        assignmentGeneration: 1,
        leaseExpiresAt: new Date(Date.now() + 600_000),
        heartbeatSeconds: 30,
        authorizationId,
        assignmentId,
      },
    })
    const binding: Binding = {
      journeyId,
      targetProjectId,
      role,
      workItemId,
      attemptId,
      assignmentId,
      assignmentGeneration: 1,
      leaseId,
      assignmentSecret: secret,
      principal,
    }
    const counts = { beforeIo: 0, afterIo: 0, effects: 0, lookups: 0 }
    const fixtureClient = client
    const assertCurrent = async (candidate: Binding, stage: 'before_io' | 'after_io') => {
      counts[stage === 'before_io' ? 'beforeIo' : 'afterIo']++
      await fixtureClient.$transaction(async tx => {
        await services.authenticateExternalQualityJourneySubmission(candidate, tx)
        const [item, attempt, authorization] = await Promise.all([
          tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: candidate.workItemId } }),
          tx.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: candidate.attemptId } }),
          tx.qualityJourneyWorkAuthorization.findUniqueOrThrow({ where: { id: authorizationId } }),
        ])
        if (
          item.status !== 'IN_PROGRESS' ||
          attempt.status !== 'IN_PROGRESS' ||
          attempt.leaseExpiresAt <= new Date() ||
          authorization.revokedAt ||
          authorization.cancelledAt
        )
          throw new Error('Fixture binding is stale or revoked.')
      })
    }
    const submitSynthetic = async (input: {
      binding?: Binding
      idempotencyKey: string
      payload: unknown
      operation?: string
    }) => {
      const candidate = input.binding ?? binding
      const operation = input.operation ?? canonicalOperations[role]
      if (operation !== canonicalOperations[candidate.role]) throw new Error('Fixture operation does not match role.')
      return fixtureClient.$transaction(tx =>
        services.acceptExternalQualityJourneySubmissionInTransaction(
          { ...candidate, operation, idempotencyKey: input.idempotencyKey, payload: input.payload },
          tx,
          async () => {
            counts.effects++
            const artifactId = `artifact_${randomUUID().replaceAll('-', '')}`
            const artifact = { role, operation, payload: input.payload, assignmentId, attemptId }
            const contentHash = digest(artifact)
            await tx.qualityJourneyArtifact.create({
              data: {
                id: artifactId,
                identityKey: `M02_SYNTHETIC:${artifactId}`,
                journeyId,
                targetProjectId,
                cycleId,
                kind: 'M02_SYNTHETIC_ACCEPTANCE',
                artifactId,
                contentHash,
                artifactJson: canonicalJson(artifact),
              },
            })
            return { artifactId, contentHash }
          },
        ),
      )
    }
    const readPersistedAcceptance = async (input: {
      binding?: Binding
      idempotencyKey: string
      operation?: string
    }) => {
      counts.lookups++
      const candidate = input.binding ?? binding
      const operation = input.operation ?? canonicalOperations[candidate.role]
      const durable = await services.readExternalQualityJourneySubmissionOutcome(
        { ...candidate, operation, idempotencyKey: input.idempotencyKey },
        fixtureClient,
      )
      const row = await fixtureClient.qualityJourneyExternalSubmissionAcceptance.findUniqueOrThrow({
        where: {
          journeyId_targetProjectId_principalId_operation_attemptId_idempotencyKey: {
            journeyId: candidate.journeyId,
            targetProjectId: candidate.targetProjectId,
            principalId: candidate.principal.principalId,
            operation,
            attemptId: candidate.attemptId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      })
      if (
        row.assignmentId !== candidate.assignmentId ||
        row.assignmentGeneration !== candidate.assignmentGeneration ||
        row.workItemId !== candidate.workItemId ||
        row.leaseId !== candidate.leaseId ||
        row.role !== candidate.role
      )
        throw new Error('Persisted acceptance identity mismatch.')
      const outcome = durable.outcome as { artifactId: string; contentHash: string }
      const artifact = await fixtureClient.qualityJourneyArtifact.findUniqueOrThrow({
        where: { id: outcome.artifactId },
      })
      if (
        artifact.kind !== 'M02_SYNTHETIC_ACCEPTANCE' ||
        artifact.journeyId !== candidate.journeyId ||
        artifact.targetProjectId !== candidate.targetProjectId ||
        artifact.contentHash !== outcome.contentHash ||
        digest(JSON.parse(artifact.artifactJson)) !== artifact.contentHash
      )
        throw new Error('Persisted artifact lineage mismatch.')
      const stored = JSON.parse(artifact.artifactJson) as { payload: unknown }
      if (row.payloadHash !== serviceDigest(stored.payload))
        throw new Error('Persisted acceptance payload lineage mismatch.')
      return { acceptanceId: row.id, artifactId: artifact.id, outcome }
    }
    const gatewayBinding: ExternalWorkerBinding = {
      hubId: `hub_${id}`,
      target: `target_${id}`,
      targetProjectId,
      journeyId,
      role,
      workItemId,
      attemptId,
      assignmentId,
      assignmentGeneration: 1,
      leaseId,
      authorizationId,
      coordinatorHandoffId: `handoff_${id}`,
      coordinatorGeneration: 1,
      transportGeneration: 1,
      expectedInputHash: inputHash,
      expectedScopeHash: inputHash,
      assignmentSecret: secret,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    }
    const gatewayToolNames: Record<QualityJourneyRole, readonly string[]> = {
      REQUIREMENT_ANALYZER: ['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1'],
      SCOUT: ['quality_journey_discovery_get', 'quality_journey_external_scout_target_observation_submit_v1'],
      RESOURCE_EXPLORER: [
        'quality_journey_discovery_get',
        'operation_search',
        'quality_journey_external_resource_explorer_resolution_submit_v1',
      ],
      TEST_SCENARIO_DESIGNER: ['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1'],
      AUTOMATOR: ['operation_search', 'quality_journey_external_automator_materialize_v1'],
      TRIAGER: [
        'quality_journey_triage_get',
        'quality_journey_triage_evidence_read',
        'quality_journey_external_triage_submit_v1',
      ],
    }
    const submitTool = gatewayToolNames[role].at(-1)!
    const submitPaths: Record<QualityJourneyRole, string> = {
      REQUIREMENT_ANALYZER: 'analysis/external-submissions',
      SCOUT: 'discovery/external-target-observations',
      RESOURCE_EXPLORER: 'discovery/external-resource-resolutions',
      TEST_SCENARIO_DESIGNER: 'scenarios/external-submissions',
      AUTOMATOR: 'automation/external-materializations',
      TRIAGER: 'triage/external-submit',
    }
    const submitPath = `quality/journeys/${journeyId}/${submitPaths[role]}`
    const frozenReads: FrozenWorkerRead[] = gatewayToolNames[role]
      .filter(name => name !== submitTool)
      .map(toolName => {
        const evidence = toolName === 'quality_journey_triage_evidence_read'
        const search = toolName === 'operation_search'
        const artifactId = `frozen_${id}`
        return {
          toolName,
          arguments: evidence ? { receiptId: artifactId, artifactKind: 'log' } : search ? { query: 'fixture' } : {},
          allowedArtifactIds: [artifactId],
          source: [
            {
              hubId: gatewayBinding.hubId,
              targetProjectId,
              journeyId,
              workItemId,
              attemptId,
              inputHash,
              scopeHash: inputHash,
              artifactId,
              data: {
                summary: 'Synthetic frozen projection',
                ...(search ? { resources: [] } : {}),
                ...(evidence
                  ? {
                      receiptId: artifactId,
                      artifactKind: 'log',
                      offset: 0,
                      limit: 65536,
                      text: 'Synthetic sealed page',
                    }
                  : {}),
              },
            },
          ],
          inputHash,
          scopeHash: inputHash,
        }
      })
    let gatewayProfileDigest: string | undefined
    const bindGatewayProfile = (value: string) => {
      gatewayProfileDigest = value
    }
    const sameGatewayBinding = (candidate: Readonly<ExternalWorkerBinding>) =>
      canonicalJson(candidate) === canonicalJson(gatewayBinding)
    const gatewayAuthorize = async (candidate: Readonly<ExternalWorkerBinding>, stage: 'before_io' | 'after_io') => {
      if (!sameGatewayBinding(candidate)) throw new Error('Gateway binding is stale.')
      await assertCurrent(binding, stage)
    }
    const hidden = new Set([
      'target',
      'journeyId',
      'workItemId',
      'attemptId',
      'assignmentId',
      'assignmentGeneration',
      'assignmentSecret',
      'leaseId',
      'expectedInputHash',
      'expectedScopeHash',
      'coordinatorHandoffId',
      'coordinatorGeneration',
      'ownerToken',
    ])
    let loseAcknowledgement = false
    const parseGatewayRequest = (requestPath: string, options?: { method?: string; body?: string }) => {
      if (!gatewayProfileDigest || options?.method !== 'POST' || !options.body || requestPath !== submitPath)
        throw new Error('Unexpected fixture API request.')
      const body = JSON.parse(options.body) as Record<string, unknown>
      if (
        body.assignmentId !== assignmentId ||
        body.workItemId !== workItemId ||
        body.attemptId !== attemptId ||
        body.assignmentGeneration !== 1 ||
        body.leaseId !== leaseId ||
        body.assignmentSecret !== secret ||
        body.target !== gatewayBinding.target
      )
        throw new Error('Fixture API assignment mismatch.')
      const workerArgs = Object.fromEntries(Object.entries(body).filter(([key]) => !hidden.has(key)))
      if (typeof workerArgs.idempotencyKey !== 'string' || !workerArgs.idempotencyKey)
        throw new Error('Fixture API idempotency identity is invalid.')
      const publicBinding = Object.fromEntries(
        Object.entries(gatewayBinding).filter(([key]) => key !== 'assignmentSecret'),
      )
      const payload = {
        toolName: submitTool,
        workerArgs,
        profileDigest: gatewayProfileDigest,
        publicBinding,
      }
      return {
        idempotencyKey: workerArgs.idempotencyKey,
        payload,
        requestHash: digest({
          toolName: submitTool,
          arguments: workerArgs,
          profileDigest: gatewayProfileDigest,
          binding: publicBinding,
        }),
      }
    }
    const gatewayRecoveryIdentity = (requestPath: string, options?: { method?: string; body?: string }) => {
      const parsed = parseGatewayRequest(requestPath, options)
      return {
        toolName: submitTool,
        idempotencyKey: parsed.idempotencyKey,
        requestHash: parsed.requestHash,
      }
    }
    const gatewayRequest = async (requestPath: string, options?: { method?: string; body?: string }) => {
      const parsed = parseGatewayRequest(requestPath, options)
      await submitSynthetic({
        idempotencyKey: parsed.idempotencyKey,
        payload: parsed.payload,
      })
      if (loseAcknowledgement) throw new Error(`Lost synthetic acknowledgement ${secret}`)
      return { accepted: true }
    }
    const gatewayReadAcceptance = async (input: {
      binding: Readonly<ExternalWorkerBinding>
      toolName: string
      idempotencyKey: string
      requestHash: string
    }) => {
      if (!sameGatewayBinding(input.binding) || input.toolName !== submitTool || !gatewayProfileDigest)
        throw new Error('Gateway acceptance binding mismatch.')
      const persisted = await readPersistedAcceptance({ idempotencyKey: input.idempotencyKey })
      const artifact = await fixtureClient.qualityJourneyArtifact.findUniqueOrThrow({
        where: { id: persisted.artifactId },
      })
      const stored = (
        JSON.parse(artifact.artifactJson) as {
          payload: {
            toolName: string
            workerArgs: Record<string, unknown>
            profileDigest: string
            publicBinding: Record<string, unknown>
          }
        }
      ).payload
      if (stored.toolName !== submitTool || stored.profileDigest !== gatewayProfileDigest)
        throw new Error('Stored gateway route mismatch.')
      // Recompute from the durable artifact. Never echo the caller's hash.
      const requestHash = digest({
        toolName: stored.toolName,
        arguments: stored.workerArgs,
        profileDigest: stored.profileDigest,
        binding: stored.publicBinding,
      })
      return {
        receiptId: persisted.acceptanceId,
        assignmentId,
        attemptId,
        operation: stored.toolName,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        artifactIds: [persisted.artifactId],
      }
    }
    /**
     * The same ID is admitted by the frozen gateway read, while the real
     * Triager evidence service must reject its different Journey owner.
     */
    const seedForeignTriageReceipt = async () => {
      if (role !== 'TRIAGER') throw new Error('Foreign receipt probe requires Triager.')
      const foreignTargetId = `foreign_target_${id}`
      const foreignJourneyId = `foreign_journey_${id}`
      const foreignCycleId = `foreign_cycle_${id}`
      const foreignExecutionId = `foreign_execution_${id}`
      const foreignRunId = `foreign_run_${id}`
      const foreignReceiptId = `foreign_receipt_${id}`
      const ownExecutionId = `execution_${id}`
      const preparedCapsuleId = `synthetic_capsule_${id}`
      const ownEnvironmentId = `environment_${id}`
      const foreignEnvironmentId = `foreign_environment_${id}`
      const execution = (executionId: string, jId: string, tId: string, cId: string, envId: string) => ({
        id: executionId,
        journeyId: jId,
        targetProjectId: tId,
        cycleId: cId,
        preparedCapsulesJson: canonicalContractJson([{ preparedCapsuleId }]),
        preparedCapsulesHash: serviceDigest([{ preparedCapsuleId }]),
        environmentId: envId,
        environmentSnapshotJson: '{}',
        environmentSnapshotHash: serviceDigest({}),
        environmentSnapshotVersion: 1,
        targetFingerprint: serviceDigest(tId),
        stateHash: serviceDigest(jId),
        idempotencyKey: `execution-${executionId}`,
        requestHash: serviceDigest(executionId),
      })
      await fixtureClient.targetProject.create({
        data: {
          id: foreignTargetId,
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${workspace}/foreign`,
          canonicalPath: `${workspace}/foreign`,
          displayName: 'Foreign synthetic target',
          fingerprint: serviceDigest(foreignTargetId),
        },
      })
      await fixtureClient.qualityJourney.create({
        data: {
          id: foreignJourneyId,
          targetProjectId: foreignTargetId,
          rootIdempotencyKey: `foreign-${id}`,
          rootRequestHash: serviceDigest(foreignJourneyId),
          activeCycleId: foreignCycleId,
          stateHash: serviceDigest(foreignJourneyId),
        },
      })
      await fixtureClient.qualityJourneyCycle.create({
        data: { id: foreignCycleId, journeyId: foreignJourneyId, sequence: 1 },
      })
      await fixtureClient.environment.createMany({
        data: [
          { id: ownEnvironmentId, targetProjectId, name: `own-${id}`, baseUrl: 'https://example.test' },
          {
            id: foreignEnvironmentId,
            targetProjectId: foreignTargetId,
            name: `foreign-${id}`,
            baseUrl: 'https://example.test',
          },
        ],
      })
      await fixtureClient.qualityJourneyExecutionCycle.create({
        data: execution(ownExecutionId, journeyId, targetProjectId, cycleId, ownEnvironmentId),
      })
      await fixtureClient.qualityJourneyExecutionCycle.create({
        data: execution(foreignExecutionId, foreignJourneyId, foreignTargetId, foreignCycleId, foreignEnvironmentId),
      })
      const foreignRun = await fixtureClient.testRun.create({
        data: {
          id: foreignRunId,
          name: 'Foreign synthetic run',
          environmentId: foreignEnvironmentId,
          targetProjectId: foreignTargetId,
          intent: 'QUALITY_JOURNEY',
          environmentSnapshotJson: '{}',
          environmentSnapshotHash: serviceDigest({}),
          environmentSnapshotVersion: 1,
        },
      })
      await fixtureClient.qualityJourneyExecutionTestRun.create({
        data: {
          id: `execution_run_${id}`,
          executionCycleId: foreignExecutionId,
          preparedCapsuleId,
          testRunId: foreignRunId,
          runId: foreignRun.runId,
        },
      })
      await fixtureClient.qualityJourneyExecutionEvidenceReceipt.create({
        data: {
          id: foreignReceiptId,
          executionCycleId: foreignExecutionId,
          testRunId: foreignRunId,
          runtimeBytesHash: serviceDigest('synthetic bytes'),
          receiptHash: serviceDigest({ foreignReceiptId }),
          evidenceJson: canonicalContractJson({ foreignReceiptId }),
        },
      })
      await fixtureClient.qualityJourneyTriageAssignment.create({
        data: {
          id: `triage_${id}`,
          journeyId,
          executionCycleId: ownExecutionId,
          workItemId,
          inputHash,
          inputJson: canonicalContractJson({ cycleId, runs: [{ evidenceReceiptId: foreignReceiptId }] }),
        },
      })
      await fixtureClient.qualityJourney.update({
        where: { id: journeyId },
        data: {
          stage: 'TRIAGE',
          activeWorkItemIdsJson: canonicalContractJson([workItemId]),
        },
      })
      const admittedAt = new Date()
      const admissionId = `admission_${id}`
      const receipt = {
        schemaVersion: 'appraise.quality-journey-external-admission/v1',
        admissionId,
        protocol: 'EXTERNAL_V1',
        assignmentId,
        assignmentGeneration: 1,
        attemptId,
        workItemId,
        journeyId,
        targetProjectId,
        role: 'TRIAGER',
        principal,
        authorizationId,
        authorizationHash: digest({}),
        inputHash,
        leaseId,
        hostIsolation: 'NOT_ATTESTED',
        admittedAt: admittedAt.toISOString(),
      }
      const request = {
        schemaVersion: 'appraise.quality-journey-external-admission-request/v1',
        operation: 'ADMIT',
        protocol: 'EXTERNAL_V1',
        journeyId,
        targetProjectId,
        role: 'TRIAGER',
        workItemId,
        attemptId,
        assignmentId,
        assignmentGeneration: 1,
        leaseId,
        assignmentSecretVerifier: services.externalAssignmentSecretHash(secret),
        idempotencyKey: `admit-${id}`,
        principal,
      }
      await fixtureClient.qualityJourneyWorkAttempt.update({
        where: { id: attemptId },
        data: {
          externalAdmissionId: admissionId,
          externalAdmissionJson: canonicalContractJson(receipt),
          externalAdmissionHash: serviceDigest(receipt),
          externalAdmissionRequestJson: canonicalContractJson(request),
          externalAdmissionRequestHash: serviceDigest(request),
          externalAdmittedAt: admittedAt,
        },
      })
      return { foreignReceiptId, ownExecutionId, foreignExecutionId }
    }
    const revoke = async () =>
      fixtureClient.qualityJourneyWorkAuthorization.update({
        where: { id: authorizationId },
        data: { revokedAt: new Date(), revokedBy: 'FIXTURE' },
      })
    const close = async () => {
      await fixtureClient.$disconnect()
      if (cleanupOnClose) await rm(workspace, { recursive: true, force: true })
    }
    return {
      client: fixtureClient,
      workspace,
      databasePath,
      binding,
      authorizationId,
      counts,
      assertCurrent,
      submitSynthetic,
      readPersistedAcceptance,
      revoke,
      close,
      gateway: {
        binding: gatewayBinding,
        frozenReads,
        authorize: gatewayAuthorize,
        request: gatewayRequest,
        recoveryIdentity: gatewayRecoveryIdentity,
        readAcceptance: gatewayReadAcceptance,
        bindProfile: bindGatewayProfile,
        loseNextAcknowledgement: () => {
          loseAcknowledgement = true
        },
        submitTool,
      },
      seedForeignTriageReceipt,
    }
  } catch (error) {
    await client?.$disconnect()
    if (cleanupOnClose) await rm(workspace, { recursive: true, force: true })
    throw error
  }
}
