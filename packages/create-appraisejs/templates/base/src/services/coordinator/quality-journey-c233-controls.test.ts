import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { chromium } from 'playwright'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { startC233Operator } from '@/test/c233-operator'
import { c233Phases, c233ProofWriter } from '@/test/c233-proof'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(close => close()))
})

async function operator() {
  const arm = vi.fn(async () => ({ returnUrl: 'http://127.0.0.1:12345/checkout' }))
  const control = await startC233Operator(arm)
  cleanup.push(control.close)
  return { ...control, arm }
}

async function post(control: Awaited<ReturnType<typeof operator>>, origin?: string, body?: string) {
  const page = await (await fetch(control.url)).text()
  const nonce = page.match(/name="nonce" value="([a-f0-9]+)"/)?.[1]
  return fetch(control.url, {
    method: 'POST',
    headers: { origin: origin ?? new URL(control.url).origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: body ?? `nonce=${nonce}`,
  })
}

it('arms only from the ready operator POST and immediately displays the frozen URL', async () => {
  const control = await operator()
  await fetch(control.url)
  expect(control.arm).not.toHaveBeenCalled()
  control.markReady()
  await fetch(control.url)
  expect(control.arm).not.toHaveBeenCalled()
  const response = await post(control)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('http://127.0.0.1:12345/checkout')
  expect(await control.armed).toEqual({ returnUrl: 'http://127.0.0.1:12345/checkout' })
  expect(control.arm).toHaveBeenCalledTimes(1)
  expect((await post(control)).status).not.toBe(200)
  expect(control.arm).toHaveBeenCalledTimes(1)
})

it('rejects foreign or missing Origin, bad nonce, extra fields and query paths without arming', async () => {
  const control = await operator()
  control.markReady()
  expect((await post(control, 'https://untrusted.example')).status).toBe(403)
  expect((await post(control, 'null')).status).toBe(403)
  expect((await post(control, undefined, `nonce=${'a'.repeat(48)}`)).status).toBe(403)
  expect((await post(control, undefined, `nonce=${'a'.repeat(48)}&url=x`)).status).toBe(403)
  expect((await fetch(`${control.url}?session=other`)).status).toBe(404)
  expect((await fetch(control.url, { method: 'POST' })).status).toBe(403)
  expect(control.arm).not.toHaveBeenCalled()
})

it('accepts the real Chromium operator form without a chat-mediated return step', async () => {
  const control = await operator()
  control.markReady()
  const browser = await chromium.launch({ headless: true })
  cleanup.push(() => browser.close())
  const page = await browser.newPage()
  await page.goto(control.url)
  expect(control.arm).not.toHaveBeenCalled()
  const submitted = page.waitForResponse(response => response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Authorize exact return' }).click()
  const response = await submitted
  const headers = await response.request().allHeaders()
  expect({
    status: response.status(),
    origin: headers.origin,
    type: headers['content-type'],
    length: headers['content-length'],
  }).toEqual({
    status: 200,
    origin: new URL(control.url).origin,
    type: 'application/x-www-form-urlencoded',
    length: '54',
  })
  expect(await page.locator('pre').textContent()).toBe('http://127.0.0.1:12345/checkout')
  expect(control.arm).toHaveBeenCalledTimes(1)
})

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
function capturedReceipt() {
  const observationFacts = [
    'Appraise loaded /checkout at http://127.0.0.1:12345/checkout.',
    'Appraise intentionally did not collect target-controlled page title content.',
    'Appraise observed access outcome ACCESS_CONFIRMED.',
  ]
  const receipt = {
    schemaVersion: 'appraise.discovery-browser-receipt/v1',
    issuer: 'APPRAISE_DISCOVERY_BROWSER_V1',
    verificationStrength: 'APPRAISE_OWNED_BROWSER',
    artifactId: 'artifact-test',
    sessionId: 'session-test',
    sessionGeneration: 1,
    processInstanceId: 'process-test',
    journeyId: 'journey-test',
    targetProjectId: 'target-test',
    cycleId: 'cycle-test',
    discoveryRevisionId: 'revision-test',
    workItemId: 'work-test',
    environmentId: 'environment-test',
    environmentScopeVersion: 1,
    routeId: '/checkout',
    snapshotId: 'snapshot-test',
    accessMode: 'AUTHENTICATED_INTENT',
    accessOutcome: 'ACCESS_CONFIRMED',
    authFlowId: 'disposable-heroku-login',
    authPolicyHash: hash('fixture-policy'),
    authTransitOutcome: 'RETURNED_TO_FROZEN_TARGET',
    humanReturn: {
      mechanism: 'EXPLICIT_ONE_SHOT_EXACT_TARGET_V1',
      authorizationId: 'return-test',
      targetUrlHash: hash('http://127.0.0.1:12345/checkout'),
      method: 'GET',
      committedAt: new Date().toISOString(),
    },
    capturedAt: new Date().toISOString(),
    url: 'http://127.0.0.1:12345/checkout',
    title: '[not persisted]',
    observationFacts,
    observationFactsHash: hash(observationFacts),
    note: 'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
  }
  return { artifactId: receipt.artifactId, contentHash: hash(receipt), receipt }
}

async function proof() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'c233-proof-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  return { writer: c233ProofWriter(directory), filename: path.join(directory, 'c2-3-live-result.json') }
}

it('retains exact receipt and admission phase when a later phase fails without claiming MFA', async () => {
  const { writer, filename } = await proof()
  const captured = capturedReceipt()
  await readyForCapture(writer)
  await writer.capture(captured)
  await writer.phase('receipt captured')
  await writer.phase('Scout admission accepted')
  await writer.fail()
  const result = JSON.parse(await readFile(filename, 'utf8'))
  expect(result).toMatchObject({
    status: 'FAILED',
    mfa: 'NOT_QUALIFIED',
    authenticatedOwnerRestart: 'NOT_QUALIFIED',
    gate: 'C_B04_OPEN',
    captured,
  })
  expect(result.phases.map((item: { phase: string }) => item.phase)).toContain('Scout admission accepted')
  expect((await stat(filename)).mode & 0o777).toBe(0o600)
})

it('rejects extra secret fields and target-controlled content without replacing retained evidence', async () => {
  const { writer, filename } = await proof()
  await readyForCapture(writer)
  const original = await readFile(filename, 'utf8')
  await expect(writer.capture({ ...capturedReceipt(), password: 'canary' })).rejects.toThrow()
  const altered = capturedReceipt()
  altered.receipt.title = 'canary'
  altered.contentHash = hash(altered.receipt)
  await expect(writer.capture(altered)).rejects.toThrow()
  await expect(writer.phase('canary' as never)).rejects.toThrow()
  expect(await readFile(filename, 'utf8')).toBe(original)
})

async function readyForCapture(writer: ReturnType<typeof c233ProofWriter>) {
  for (const phase of c233Phases.slice(0, c233Phases.indexOf('receipt captured'))) await writer.phase(phase)
}

it('rejects premature completion, reordered phases, repeats and capture without a confirmed phase', async () => {
  const { writer, filename } = await proof()
  await expect(writer.complete()).rejects.toThrow()
  await expect(writer.phase('Scout admission accepted')).rejects.toThrow()
  await expect(writer.capture(capturedReceipt())).rejects.toThrow()
  await writer.phase('lineage ready')
  await expect(writer.phase('lineage ready')).rejects.toThrow()
  await expect(writer.phase('access confirmed')).rejects.toThrow()
  await expect(writer.complete()).rejects.toThrow()
  expect(JSON.parse(await readFile(filename, 'utf8')).status).toBe('RUNNING')
})

it('requires authenticated return provenance and receipt retention before admission', async () => {
  const { writer } = await proof()
  await readyForCapture(writer)
  await expect(writer.phase('receipt captured')).rejects.toThrow()
  const captured = capturedReceipt()
  const anonymous = { ...captured.receipt, accessMode: 'ANONYMOUS', accessOutcome: 'ACTIVE' }
  for (const key of ['authFlowId', 'authPolicyHash', 'authTransitOutcome', 'humanReturn'])
    Reflect.deleteProperty(anonymous, key)
  anonymous.observationFacts = captured.receipt.observationFacts.map(fact => fact.replace('ACCESS_CONFIRMED', 'ACTIVE'))
  anonymous.observationFactsHash = hash(anonymous.observationFacts)
  await expect(writer.capture({ ...captured, receipt: anonymous, contentHash: hash(anonymous) })).rejects.toThrow()
  const activeOnly = { ...captured.receipt, accessOutcome: 'ACTIVE' }
  await expect(writer.capture({ ...captured, receipt: activeOnly, contentHash: hash(activeOnly) })).rejects.toThrow()
  const wrongReturn = {
    ...captured.receipt,
    humanReturn: { ...captured.receipt.humanReturn, targetUrlHash: hash('wrong-target') },
  }
  await expect(writer.capture({ ...captured, receipt: wrongReturn, contentHash: hash(wrongReturn) })).rejects.toThrow()
  await expect(writer.phase('Scout admission accepted')).rejects.toThrow()
  await expect(writer.complete()).rejects.toThrow()
})

it('completes only the entire basic smoke sequence and keeps MFA and authenticated restart unqualified', async () => {
  const { writer, filename } = await proof()
  await readyForCapture(writer)
  await writer.capture(capturedReceipt())
  for (const phase of c233Phases.slice(c233Phases.indexOf('receipt captured'))) await writer.phase(phase)
  await writer.complete()
  expect(JSON.parse(await readFile(filename, 'utf8'))).toMatchObject({
    status: 'BASIC_SMOKE_COMPLETE',
    mfa: 'NOT_QUALIFIED',
    authenticatedOwnerRestart: 'NOT_QUALIFIED',
    gate: 'C_B04_OPEN',
  })
  await expect(writer.phase('lineage ready')).rejects.toThrow()
  await expect(writer.fail()).rejects.toThrow()
})
