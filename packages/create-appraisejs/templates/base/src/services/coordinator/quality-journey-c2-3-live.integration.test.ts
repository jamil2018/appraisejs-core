/**
 * Opt-in human qualification only. Run with APPRAISE_C233_LIVE=1 in a desktop
 * session. It deliberately never reads credentials, browser storage, page
 * content, screenshots, traces, request bodies, or query strings.
 *
 * Operator steps (shown only for an opted-in run): use the Appraise headed
 * browser to follow the local checkout link, complete only your disposable
 * login/MFA there, return to the checkout route, submit the local second
 * factor form, then leave the browser on checkout. Never enter credentials in
 * this terminal or put them in environment variables.
 *
 * This is intentionally excluded from normal Vitest runs. It is a bounded
 * C2.3.3 qualification harness, not an automated IdP test.
 */
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { normalizeDiscoveryAuthTransitPolicyJson } from '@/lib/quality-journey/discovery-auth-transit-policy'
import {
  armQualityJourneyDiscoveryBrowserHumanReturn,
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  confirmQualityJourneyDiscoveryBrowserAccess,
  getQualityJourneyDiscoveryBrowserSession,
  getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
} from './quality-journey-discovery-browser-service'
import { getQualityJourneyDiscovery, submitQualityJourneyTargetObservation } from './quality-journey-discovery-service'
import {
  claimQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  publishQualityJourneyAnalysis,
  submitQualityJourneyAnalysisSuccessor,
} from './quality-journey-analysis-service'
import { clearAgentFactoryProviderAdaptersForTest, registerAgentFactoryProviderAdapter } from '@/lib/quality-journey'

const enabled = process.env.APPRAISE_C233_LIVE === '1'
const workspaces: string[] = []
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const digest = (character: string) => `sha256:${character.repeat(64)}`
const execFileAsync = promisify(execFile)
const disposableHerokuOrigin = 'https://the-internet.herokuapp.com'
const disposableHerokuSameOriginSubresources = [
  '/js/vendor/298279967.js',
  '/css/app.css',
  '/css/font-awesome.css',
  '/js/vendor/jquery-1.11.3.min.js',
  '/js/vendor/jquery-ui-1.11.4/jquery-ui.js',
  '/js/foundation/foundation.js',
  '/js/foundation/foundation.alerts.js',
  '/img/forkme_right_green_007200.png',
  '/fonts/fontawesome-webfont.woff2',
] as const

type QualifiedScout = {
  journeyId: string
  targetProjectId: string
  discoveryRevisionId: string
  cycleId: string
  workItemId: string
  attemptId: string
  leaseId: string
  ownerToken: string
  authorizationId: string
  inputHash: string
  scopeHash: string
  analysisRevision: { artifactId: string; revisionId: string; contentHash: string }
  analysisApproval: { artifactId: string; contentHash: string }
  approvedRequirementSetHash: string
  inputArtifacts: unknown[]
}

type Phase =
  | 'lineage ready'
  | 'browser launched'
  | 'left target for IdP'
  | 'human return armed'
  | 'returned to exact target'
  | 'access confirmed'
  | 'receipt captured'
  | 'Scout admission accepted'
  | 'restart invalidated'
  | 'revocation verified'

function phaseReporter() {
  let current: Phase | undefined
  return (next: Phase, detail?: string) => {
    if (current === next) return
    current = next
    console.info(`C2.3.3 live phase: ${next}${detail ? ` — ${detail}` : ''}`)
  }
}

function sanitizedOriginPath(value: string) {
  if (value === 'about:blank') return value
  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return 'invalid-url'
  }
}

/** Counts only a POST observed after the exact post-IdP return arms this gate. */
function secondFactorGate() {
  let armed = false
  let submissionsAfterArm = 0
  return {
    recordDiscardedPost: () => {
      if (armed) submissionsAfterArm += 1
    },
    armSecondFactor: () => {
      armed = true
      submissionsAfterArm = 0
    },
    secondFactorSubmitted: () => armed && submissionsAfterArm > 0,
  }
}

function transitPolicy() {
  return JSON.stringify({
    schemaVersion: 'appraise.discovery-auth-transit/v1',
    flows: [
      {
        flowId: 'disposable-heroku-login',
        rules: [
          {
            documentOrigin: '$TARGET',
            destinationOrigin: disposableHerokuOrigin,
            path: { match: 'EXACT', value: '/login' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: disposableHerokuOrigin,
            destinationOrigin: disposableHerokuOrigin,
            path: { match: 'EXACT', value: '/login' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: disposableHerokuOrigin,
            destinationOrigin: disposableHerokuOrigin,
            path: { match: 'EXACT', value: '/authenticate' },
            methods: ['POST'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: disposableHerokuOrigin,
            destinationOrigin: disposableHerokuOrigin,
            path: { match: 'EXACT', value: '/secure' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: disposableHerokuOrigin,
            destinationOrigin: '$TARGET',
            path: { match: 'EXACT', value: '/checkout' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          ...disposableHerokuSameOriginSubresources.map(path => ({
            documentOrigin: disposableHerokuOrigin,
            destinationOrigin: disposableHerokuOrigin,
            path: { match: 'EXACT' as const, value: path },
            methods: ['GET'],
            requestKinds: ['SUBRESOURCE'],
          })),
        ],
        returns: [{ fromOrigin: disposableHerokuOrigin, targetPath: '/checkout', methods: ['GET'] }],
      },
    ],
  })
}

async function localCheckoutFixture() {
  const gate = secondFactorGate()
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] !== '/checkout') return response.writeHead(404).end()
    // Intentionally consume and discard a second-factor body; never log or retain it.
    request.resume()
    if (request.method === 'POST') {
      gate.recordDiscardedPost()
      return response.writeHead(303, { location: '/checkout' }).end()
    }
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        '<!doctype html><title>Appraise C2.3.3 disposable checkout</title><main><h1>Appraise C2.3.3 disposable checkout</h1><p>After provider success, use the address bar to return here. Do not use browser Back. Submit the local second-factor form and leave this window open.</p><a href="https://the-internet.herokuapp.com/login">Open disposable identity-provider login</a><form method="post"><label>Second-factor confirmation <input name="secondFactor" autocomplete="one-time-code" required></label><button>Continue</button></form></main>',
      )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Live fixture did not bind an ephemeral TCP port.')
  return { server, baseUrl: `http://127.0.0.1:${address.port}`, ...gate }
}

function registerLiveAdapter(attemptId: string) {
  registerAgentFactoryProviderAdapter({
    adapterId: `c233-live-${attemptId}`,
    supports: request => request.attemptId === attemptId,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `opaque-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'qualification-harness',
        reasoningLevel: 'HIGH',
        latencyPreference: 'FAST',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('b')],
      })),
      startedAt: new Date().toISOString(),
    }),
  })
}

/** Uses the same public lifecycle calls as the SQLite integration lineage. */
async function approvedScout(client: PrismaClient, baseUrl: string): Promise<QualifiedScout> {
  const targetProjectId = `c233-target-${randomUUID()}`
  await client.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `live:${targetProjectId}`,
      canonicalPath: process.cwd(),
      displayName: 'C2.3.3 disposable live qualification',
      fingerprint: digest('p'),
    },
  })
  await client.environment.create({
    data: {
      id: 'c233-environment',
      name: 'live-local',
      baseUrl,
      targetProjectId,
      discoveryAuthTransitPolicyJson: normalizeDiscoveryAuthTransitPolicyJson(transitPolicy(), new URL(baseUrl).origin),
    },
  })
  await client.module.create({ data: { id: 'c233-module', name: 'Checkout', targetProjectId } })
  await client.locatorGroup.create({
    data: { id: 'c233-locator', name: 'Checkout', route: '/checkout', moduleId: 'c233-module', targetProjectId },
  })
  const created = await createQualityJourney(
    { targetProjectId, idempotencyKey: 'c233-create', requirement: { objective: 'Disposable checkout qualification' } },
    client,
  )
  const requirement = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-submit-requirement',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'c233-submit-requirement',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: requirement.id, requirementHash: requirement.contentHash },
    },
    client,
  )
  const analysis = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId, role: 'REQUIREMENT_ANALYZER' },
    client,
  )
  registerLiveAdapter(analysis.attempt.id)
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: analysis.workItem.id,
      leaseId: analysis.attempt.leaseId,
      ownerToken: analysis.ownerToken,
    },
    client,
  )
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    charterId: 'c233-charter',
    analysisRevisionId: 'c233-analysis',
    journeyId: created.journey.journeyId,
    targetProjectId,
    cycleId: created.journey.activeCycleId,
    requirementRevisionId: requirement.id,
    objectives: ['Qualify scoped checkout access.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Human'],
    requirements: [
      { requirementId: 'C233-REQ', statement: 'Human confirms scoped checkout access.', sourceRefs: ['live-harness'] },
    ],
    obligations: [
      {
        obligationId: 'C233-OBL',
        requirementId: 'C233-REQ',
        statement: 'Checkout is reachable.',
        acceptanceSignals: ['Checkout'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Checkout'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'c233-question',
        prompt: 'Is the disposable account authorized?',
        required: true,
        rationale: 'Human-only live qualification.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
  const submitted = await submitQualityJourneyAnalysisSuccessor(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: analysis.workItem.id,
      attemptId: analysis.attempt.id,
      leaseId: analysis.attempt.leaseId,
      ownerToken: analysis.ownerToken,
      idempotencyKey: 'c233-analysis-submit',
      charter,
    },
    client,
  )
  await answerQualityJourneyAnalysisQuestion(
    {
      idempotencyKey: 'c233-answer',
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        answerId: 'c233-answer',
        journeyId: created.journey.journeyId,
        targetProjectId,
        analysisRevisionId: submitted.analysisRevision.id,
        questionId: 'c233-question',
        answer: 'Yes, operated only in the headed browser.',
        actor: 'USER',
      },
    },
    client,
  )
  const analysisRef = {
    kind: 'ANALYSIS_CHARTER_REVISION' as const,
    artifactId: 'c233-charter',
    revisionId: 'c233-analysis',
    contentHash: submitted.analysisRevision.contentHash,
  }
  const publishState = await getQualityJourney({ journeyId: created.journey.journeyId, targetProjectId }, client)
  await publishQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-publish',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'RUNNER',
      command: 'PUBLISH_ANALYSIS',
      expectedStateHash: publishState.journey.stateHash,
      idempotencyKey: 'c233-publish',
      inputArtifactRefs: [analysisRef],
      payload: {
        artifactRevisionId: submitted.analysisRevision.id,
        artifactHash: submitted.analysisRevision.contentHash,
      },
    },
    client,
  )
  const decisionState = await getQualityJourney({ journeyId: created.journey.journeyId, targetProjectId }, client)
  await decideQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-approve',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: decisionState.journey.stateHash,
      idempotencyKey: 'c233-approve',
      inputArtifactRefs: [analysisRef],
      payload: {
        revisionId: submitted.analysisRevision.id,
        contentHash: submitted.analysisRevision.contentHash,
        decision: 'APPROVED',
      },
    },
    client,
  )
  const revision = (await getQualityJourneyDiscovery({ journeyId: created.journey.journeyId, targetProjectId }, client))
    .revisions[0]!
  const scout = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId, role: 'SCOUT' },
    client,
  )
  registerLiveAdapter(scout.attempt.id)
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: scout.workItem.id,
      leaseId: scout.attempt.leaseId,
      ownerToken: scout.ownerToken,
    },
    client,
  )
  const scope = JSON.parse(revision.scoutWorkItem.authorizationScopeJson)
  return {
    journeyId: created.journey.journeyId,
    targetProjectId,
    discoveryRevisionId: revision.id,
    cycleId: created.journey.activeCycleId,
    workItemId: scout.workItem.id,
    attemptId: scout.attempt.id,
    leaseId: scout.attempt.leaseId,
    ownerToken: scout.ownerToken,
    authorizationId: scout.attempt.authorizationId!,
    inputHash: revision.scoutInputHash,
    scopeHash: hash(scope),
    analysisRevision: {
      artifactId: revision.analysisRevisionArtifactId,
      revisionId: submitted.analysisRevision.id,
      contentHash: revision.analysisRevisionContentHash,
    },
    analysisApproval: {
      artifactId: revision.analysisApprovalArtifactId,
      contentHash: revision.analysisApprovalContentHash,
    },
    approvedRequirementSetHash: revision.approvedRequirementSetHash,
    inputArtifacts: JSON.parse(revision.scoutWorkItem.inputArtifactRefsJson),
  }
}

async function waitForHumanReturn(
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
  returnUrl: string,
  report: ReturnType<typeof phaseReporter>,
) {
  const expires = Date.now() + 10 * 60_000
  let leftTarget = false
  const exactTarget = sanitizedOriginPath(returnUrl)
  while (Date.now() < expires) {
    const session = await getQualityJourneyDiscoveryBrowserSession(scope)
    const current = sanitizedOriginPath(session.currentUrl)
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, current)
    if (current !== exactTarget && !leftTarget) {
      leftTarget = true
      report('left target for IdP')
    }
    if (leftTarget && current === exactTarget) {
      report('returned to exact target')
      return session
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error('Timed out waiting for the human-operated browser to return to the frozen checkout route.')
}

async function waitForAuthorizedProviderSuccess(
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
  report: ReturnType<typeof phaseReporter>,
) {
  const expires = Date.now() + 10 * 60_000
  const authorizedSuccess = 'https://the-internet.herokuapp.com/secure'
  while (Date.now() < expires) {
    const session = await getQualityJourneyDiscoveryBrowserSession(scope)
    const current = sanitizedOriginPath(session.currentUrl)
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, current)
    if (current !== sanitizedOriginPath(`${session.targetOrigin}/checkout`)) report('left target for IdP')
    if (current === authorizedSuccess) return session
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error('Timed out waiting for the authorized provider success route in the human-operated browser.')
}

async function waitForSecondFactor(
  fixture: { secondFactorSubmitted(): boolean },
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
) {
  const expires = Date.now() + 5 * 60_000
  while (Date.now() < expires) {
    const session = await getQualityJourneyDiscoveryBrowserSession(scope)
    const current = sanitizedOriginPath(session.currentUrl)
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, current)
    if (fixture.secondFactorSubmitted()) return
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error('Timed out waiting for the local second-factor form submission.')
}

async function terminalSessionError(
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
  state: string,
  originPath: string,
) {
  const diagnostic = await getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification(scope)
  return new Error(
    `Browser session became ${state} (${diagnostic.terminalCause ?? 'NO_TRANSIENT_CAUSE'}) at ${originPath}; stop and inspect the visible browser only.`,
  )
}

async function writeSanitizedResult(resultDirectory: string, result: Record<string, unknown>) {
  const safe = JSON.stringify(result)
  if (/https?:|\?|password|cookie|title|body/i.test(safe))
    throw new Error('Live qualification result violated the sanitization policy.')
  await fs.mkdir(resultDirectory, { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(resultDirectory, 'c2-3-live-result.json'), safe, { mode: 0o600 })
}

/** A real new Node process must never recover the local, process-scoped map. */
async function assertTwoProcessRestartInvalidation(scope: {
  journeyId: string
  targetProjectId: string
  discoveryRevisionId: string
  sessionId: string
}) {
  const modulePath = path.join(process.cwd(), 'src/services/coordinator/quality-journey-discovery-browser-service.ts')
  const source = `import { getQualityJourneyDiscoveryBrowserSession as get } from ${JSON.stringify(modulePath)}; get(${JSON.stringify(scope)}).then(() => process.stdout.write('unexpected')).catch(error => process.stdout.write(error.code === 'NOT_FOUND' ? 'not-found' : 'unexpected'));`
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx/esm', '--eval', source], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test' },
  })
  if (stdout.trim() !== 'not-found')
    throw new Error('A restarted broker process unexpectedly recovered a browser session.')
}

it('does not count discarded second-factor POSTs until the post-return gate is armed and reset', () => {
  const gate = secondFactorGate()
  gate.recordDiscardedPost()
  expect(gate.secondFactorSubmitted()).toBe(false)
  gate.armSecondFactor()
  expect(gate.secondFactorSubmitted()).toBe(false)
  gate.recordDiscardedPost()
  expect(gate.secondFactorSubmitted()).toBe(true)
  gate.armSecondFactor()
  expect(gate.secondFactorSubmitted()).toBe(false)
})

it('authorizes only the exact provider login document re-entry needed for validation redirects', () => {
  const policy = JSON.parse(normalizeDiscoveryAuthTransitPolicyJson(transitPolicy(), 'http://127.0.0.1:3000')!)
  expect(policy.flows[0].rules).toContainEqual({
    documentOrigin: disposableHerokuOrigin,
    destinationOrigin: disposableHerokuOrigin,
    path: { match: 'EXACT', value: '/login' },
    methods: ['GET'],
    requestKinds: ['DOCUMENT'],
  })
})

it('canonically permits only the inspected same-origin provider subresources before return arming', () => {
  const policy = JSON.parse(normalizeDiscoveryAuthTransitPolicyJson(transitPolicy(), 'http://127.0.0.1:3000')!)
  const subresourceRules = policy.flows[0].rules.filter((rule: { requestKinds: string[] }) =>
    rule.requestKinds.includes('SUBRESOURCE'),
  )
  expect(subresourceRules).toEqual(
    disposableHerokuSameOriginSubresources.toSorted().map(path => ({
      documentOrigin: disposableHerokuOrigin,
      destinationOrigin: disposableHerokuOrigin,
      path: { match: 'EXACT', value: path },
      methods: ['GET'],
      requestKinds: ['SUBRESOURCE'],
    })),
  )
})

afterEach(async () => {
  clearQualityJourneyDiscoveryBrowserSessionsForTest()
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe.skipIf(!enabled)('C2.3.3 headed live human qualification', () => {
  it(
    'admits a sealed receipt through the real Scout boundary and proves restart/revocation invalidation',
    async () => {
      const resultDirectory = process.env.APPRAISE_C233_RESULT_DIR
      if (!resultDirectory)
        throw new Error('Set APPRAISE_C233_RESULT_DIR to a local directory for the sanitized result artifact.')
      const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-c233-live-'))
      workspaces.push(workspace)
      const dbPath = path.join(workspace, 'qualification.db')
      await copyMigratedTestDatabase(dbPath)
      const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } })
      const fixture = await localCheckoutFixture()
      try {
        const report = phaseReporter()
        const scout = await approvedScout(client, fixture.baseUrl)
        report('lineage ready')
        const browserScope = {
          journeyId: scout.journeyId,
          targetProjectId: scout.targetProjectId,
          discoveryRevisionId: scout.discoveryRevisionId,
        }
        const session = await startQualityJourneyDiscoveryBrowserSession(
          {
            ...browserScope,
            workItemId: scout.workItemId,
            environmentId: 'c233-environment',
            routeId: '/checkout',
            accessMode: 'AUTHENTICATED_INTENT',
            authFlowId: 'disposable-heroku-login',
            ttlSeconds: 600,
          },
          client,
        )
        report(
          'browser launched',
          'complete the provider login and wait in the headed browser; Appraise will provide the next bounded instruction only after approved provider success.',
        )
        await waitForAuthorizedProviderSuccess({ ...browserScope, sessionId: session.id }, report)
        const armed = await armQualityJourneyDiscoveryBrowserHumanReturn(
          { ...browserScope, sessionId: session.id },
          client,
        )
        report(
          'human return armed',
          `type ${armed.returnUrl} in the address bar now; never use Back; leave the visible browser open`,
        )
        await waitForHumanReturn({ ...browserScope, sessionId: session.id }, armed.returnUrl, report)
        // Reset only after the committed post-IdP return; earlier discarded POSTs cannot qualify.
        fixture.armSecondFactor()
        await waitForSecondFactor(fixture, { ...browserScope, sessionId: session.id })
        await confirmQualityJourneyDiscoveryBrowserAccess({ ...browserScope, sessionId: session.id }, client)
        report('access confirmed')
        const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
          { ...browserScope, sessionId: session.id, snapshotId: `snapshot-${randomUUID()}` },
          client,
        )
        report('receipt captured')
        const admittedFact = captured.receipt.observationFacts.find(fact =>
          fact.includes('Appraise observed access outcome ACCESS_CONFIRMED.'),
        )
        if (!admittedFact) throw new Error('The sealed receipt omitted its authenticated access outcome fact.')
        const admission = await submitQualityJourneyTargetObservation(
          {
            journeyId: scout.journeyId,
            targetProjectId: scout.targetProjectId,
            discoveryRevisionId: scout.discoveryRevisionId,
            workItemId: scout.workItemId,
            attemptId: scout.attemptId,
            leaseId: scout.leaseId,
            ownerToken: scout.ownerToken,
            idempotencyKey: 'c233-live-observation',
            expectedInputHash: scout.inputHash,
            expectedScopeHash: scout.scopeHash,
            bundle: {
              schemaVersion: 'appraise.quality-journey/v1',
              bundleId: `bundle-${randomUUID()}`,
              journeyId: scout.journeyId,
              targetProjectId: scout.targetProjectId,
              cycleId: scout.cycleId,
              workItemId: scout.workItemId,
              attemptId: scout.attemptId,
              authorizationId: scout.authorizationId,
              inputHash: scout.inputHash,
              assignmentScopeHash: scout.scopeHash,
              analysisRevision: scout.analysisRevision,
              analysisApproval: scout.analysisApproval,
              approvedRequirementSetHash: scout.approvedRequirementSetHash,
              inputArtifacts: scout.inputArtifacts,
              evidenceReceipts: [{ artifactId: captured.artifactId, contentHash: captured.contentHash }],
              observedAt: new Date().toISOString(),
              targetSnapshot: {
                snapshotId: captured.receipt.snapshotId,
                capturedAt: new Date().toISOString(),
                contentHash: digest('s'),
              },
              observations: [
                {
                  observationId: `observation-${randomUUID()}`,
                  snapshotId: captured.receipt.snapshotId,
                  routeId: '/checkout',
                  environmentId: 'c233-environment',
                  fact: admittedFact,
                  evidenceReceiptIds: [captured.artifactId],
                  confidence: 'HIGH',
                  confidenceRationale: 'Appraise-issued sealed browser receipt.',
                  stability: 'STABLE',
                  stabilityRationale: 'Frozen selected route.',
                  revalidationPolicy: { triggers: ['environment_registry_changed'] },
                },
              ],
            },
          },
          client,
        )
        expect(admission).toMatchObject({ replayed: false })
        report('Scout admission accepted')
        await assertTwoProcessRestartInvalidation({ ...browserScope, sessionId: session.id })
        report('restart invalidated')
        const revoked = await startQualityJourneyDiscoveryBrowserSession(
          {
            ...browserScope,
            workItemId: scout.workItemId,
            environmentId: 'c233-environment',
            routeId: '/checkout',
            accessMode: 'ANONYMOUS',
          },
          client,
        )
        await revokeQualityJourneyDiscoveryBrowserSession({ ...browserScope, sessionId: revoked.id })
        await expect(
          captureQualityJourneyDiscoveryBrowserReceipt(
            { ...browserScope, sessionId: revoked.id, snapshotId: `revoked-${randomUUID()}` },
            client,
          ),
        ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        report('revocation verified')
        expect(fixture.secondFactorSubmitted()).toBe(true)
        await writeSanitizedResult(resultDirectory, {
          receiptArtifactId: captured.artifactId,
          receiptHash: captured.contentHash,
          admitted: 'SUCCEEDED',
          revoked: 'REJECTED',
          restarted: 'NOT_FOUND_IN_NEW_PROCESS',
          completedAt: new Date().toISOString(),
        })
      } finally {
        await client.$disconnect()
        await new Promise<void>(resolve => fixture.server.close(() => resolve()))
      }
    },
    12 * 60_000,
  )
})
