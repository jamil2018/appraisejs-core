/**
 * Retired legacy human qualification harness. It deliberately never reads credentials, browser storage, page
 * content, screenshots, traces, request bodies, or query strings.
 *
 * Operator steps (shown only for an opted-in run): use the Appraise headed
 * browser to follow the local checkout link, complete only your disposable
 * basic login there, then use the separate loopback operator control to arm
 * return to checkout. This fixture does not qualify MFA. Never enter credentials in
 * this terminal or put them in environment variables.
 *
 * This is intentionally excluded from normal Vitest runs. It is a bounded
 * C2.3.3 qualification harness, not an automated IdP test. Authenticated
 * transit URLs are now private, so this legacy provider-success poll cannot
 * qualify C2.3.3; use the reviewed automated-return harness instead.
 */
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { admitC233ScoutReceipt, createC233ApprovedScoutLineage, type QualifiedScout } from '@/test/c233-live-lineage'
import { startC233Operator } from '@/test/c233-operator'
import { qualifyC233GracefulOwnerRestart } from '@/test/c233-restart-harness'
import { c233ProofWriter, type c233Phases } from '@/test/c233-proof'
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
import { clearAgentFactoryProviderAdaptersForTest } from '@/lib/quality-journey'

const enabled = false // The provider-success URL projection this legacy harness needs was removed.
const workspaces: string[] = []
const disposableHerokuOrigin = 'https://the-internet.herokuapp.com'
// Optional provider fonts are intentionally outside this disposable policy. A native
// font failure was observed; denying it before contact preserves fail-closed runtime behavior.
const disposableHerokuSameOriginSubresources = [
  '/js/vendor/298279967.js',
  '/css/app.css',
  '/css/font-awesome.css',
  '/js/vendor/jquery-1.11.3.min.js',
  '/js/vendor/jquery-ui-1.11.4/jquery-ui.js',
  '/js/foundation/foundation.js',
  '/js/foundation/foundation.alerts.js',
  '/img/forkme_right_green_007200.png',
] as const

type Phase = (typeof c233Phases)[number]

function phaseReporter(proof: ReturnType<typeof c233ProofWriter>) {
  let current: Phase | undefined
  return async (next: Phase, detail?: string) => {
    if (current === next) return
    current = next
    await proof.phase(next)
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
  const server = createServer((request, response) => {
    if (request.url?.split('?')[0] !== '/checkout') return response.writeHead(404).end()
    request.resume()
    if (request.method !== 'GET') return response.writeHead(405).end()
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(
        '<!doctype html><title>Appraise C2.3.3 disposable checkout</title><main><h1>Appraise C2.3.3 disposable checkout</h1><p>This basic login smoke does not qualify MFA. After provider success, use the separate Appraise operator control to authorize return. Do not use Back. Leave this browser open.</p><a href="https://the-internet.herokuapp.com/login">Open disposable provider login</a></main>',
      )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Live fixture did not bind an ephemeral TCP port.')
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

/** Uses the same public lifecycle calls as the SQLite integration lineage. */
async function approvedScout(client: PrismaClient, baseUrl: string): Promise<QualifiedScout> {
  return createC233ApprovedScoutLineage(client, {
    baseUrl,
    canonicalAuthTransitPolicyJson: normalizeDiscoveryAuthTransitPolicyJson(transitPolicy(), new URL(baseUrl).origin)!,
  })
}

async function waitForHumanReturn(
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
  returnUrl: string,
  report: ReturnType<typeof phaseReporter>,
) {
  const expires = Date.now() + 10 * 60_000
  const exactTarget = sanitizedOriginPath(returnUrl)
  while (Date.now() < expires) {
    const session = await getQualityJourneyDiscoveryBrowserSession(scope)
    const current = sanitizedOriginPath(session.currentUrl ?? '')
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, current)
    if (current === exactTarget) {
      await report('returned to exact target')
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
    if (session.currentUrl === null)
      throw new Error('Legacy provider-success observation is unavailable; use the reviewed automated-return harness.')
    const current = sanitizedOriginPath(session.currentUrl)
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, current)
    if (current !== sanitizedOriginPath(`${session.targetOrigin}/checkout`)) await report('left target for IdP')
    if (current === authorizedSuccess) return session
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  throw new Error('Timed out waiting for the authorized provider success route in the human-operated browser.')
}

async function waitForOperatorArm(
  operator: Awaited<ReturnType<typeof startC233Operator>>,
  scope: Pick<QualifiedScout, 'journeyId' | 'targetProjectId' | 'discoveryRevisionId'> & { sessionId: string },
) {
  let result: { returnUrl: string } | undefined
  let failure: unknown
  void operator.armed.then(
    value => {
      result = value
    },
    error => {
      failure = error
    },
  )
  while (!result) {
    if (failure) throw failure
    const session = await getQualityJourneyDiscoveryBrowserSession(scope)
    if (session.state !== 'ACTIVE') throw await terminalSessionError(scope, session.state, 'scoped session')
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return result
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
  await clearQualityJourneyDiscoveryBrowserSessionsForTest()
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

describe.skipIf(!enabled)('C2.3.3 headed live human qualification', () => {
  it(
    'admits a basic sign-in receipt through Scout and records remaining qualification gaps',
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
      const proof = c233ProofWriter(resultDirectory)
      let operator: Awaited<ReturnType<typeof startC233Operator>> | undefined
      try {
        const report = phaseReporter(proof)
        const scout = await approvedScout(client, fixture.baseUrl)
        await report('lineage ready')
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
        await report(
          'browser launched',
          'complete the basic provider login and wait in the headed browser; this smoke does not qualify MFA.',
        )
        await waitForAuthorizedProviderSuccess({ ...browserScope, sessionId: session.id }, report)
        await report('provider success observed')
        operator = await startC233Operator(() =>
          armQualityJourneyDiscoveryBrowserHumanReturn({ ...browserScope, sessionId: session.id }, client),
        )
        operator.markReady()
        console.info(`Open the Appraise qualification control at ${operator.url}; arm return there when ready.`)
        const armed = await waitForOperatorArm(operator, { ...browserScope, sessionId: session.id })
        await report('human return armed')
        await waitForHumanReturn({ ...browserScope, sessionId: session.id }, armed.returnUrl, report)
        await confirmQualityJourneyDiscoveryBrowserAccess({ ...browserScope, sessionId: session.id }, client)
        await report('access confirmed')
        const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
          { ...browserScope, sessionId: session.id, snapshotId: `snapshot-${randomUUID()}` },
          client,
        )
        await proof.capture(captured)
        await report('receipt captured')
        const admission = await admitC233ScoutReceipt(client, { scout, captured })
        expect(admission).toMatchObject({ replayed: false })
        await report('Scout admission accepted')
        await qualifyC233GracefulOwnerRestart()
        await report('synthetic owner restart verified')
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
        await report('revocation verified')
        await proof.complete()
      } catch (error) {
        await proof.fail()
        throw error
      } finally {
        await operator?.close()
        await clearQualityJourneyDiscoveryBrowserSessionsForTest()
        await client.$disconnect()
        await new Promise<void>(resolve => fixture.server.close(() => resolve()))
      }
    },
    12 * 60_000,
  )
})
