import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { expect, test } from '@playwright/test'

function checkoutFixture<T>(...args: string[]): T {
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'e2e/helpers/quality-journey-chat-execution-fixture.ts', ...args],
    { encoding: 'utf8' },
  )
  const prefix = 'APPRAISE_E2E_FIXTURE='
  const result = output.split('\n').find(line => line.startsWith(prefix))
  if (!result) throw new Error('The checkout fixture did not return its saved scope.')
  return JSON.parse(result.slice(prefix.length)) as T
}

test('saved checkout chat restores one authorized failing attempt and its scoped evidence', async ({
  page,
  context,
  baseURL,
}) => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl?.startsWith('file:') || databaseUrl.includes('project.db')) {
    throw new Error('The checkout fixture requires a disposable SQLite database.')
  }
  const client = new PrismaClient({ datasources: { db: { url: `${databaseUrl}?connection_limit=1` } } })
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-chat-checkout-'))
  let checkoutVisits = 0
  let releaseCheckout: () => void = () => undefined
  const checkoutResponse = new Promise<void>(resolve => {
    releaseCheckout = resolve
  })
  const target = createServer(async (request, response) => {
    if (request.url !== '/checkout') {
      response.writeHead(404).end()
      return
    }
    checkoutVisits++
    await checkoutResponse
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        '<!doctype html><title>Order confirmed</title><main id="confirmation"><h1>Order confirmed</h1><p>Your purchase was successful.</p></main>',
      )
  })

  try {
    await new Promise<void>((resolve, reject) => {
      target.once('error', reject)
      target.listen(0, '127.0.0.1', resolve)
    })
    const address = target.address()
    if (!address || typeof address === 'string') throw new Error('Checkout fixture has no local address.')
    const targetUrl = `http://127.0.0.1:${address.port}/checkout`
    const prepared = checkoutFixture<{
      targetProjectId: string
      journeyId: string
      conversationId: string
      preparedRuntimeCapsuleIds: string[]
    }>('seed', workspace, targetUrl)
    const { targetProjectId, journeyId, conversationId } = prepared
    const where = { targetProjectId, journeyId }
    await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
    const chatPath = `/conversations/${conversationId}`
    const chatUrl = `${chatPath}?project=${targetProjectId}`
    await page.goto(chatUrl)
    await page.getByRole('button', { name: 'Review run permission' }).click()
    const permission = page.getByRole('article', { name: 'Run permission' })
    await expect(permission.getByRole('button', { name: 'Allow and run these tests' })).toBeEnabled()
    const requested = await client.qualityJourneyExecutionConsent.findFirstOrThrow({ where })
    expect(requested).toMatchObject({ status: 'REQUESTED', grantedAt: null, usedAt: null })
    expect(await client.qualityJourneyExecutionCycle.count({ where })).toBe(0)
    expect(checkoutVisits).toBe(0)
    await permission.getByText('Exact reviewed scope').click()
    await expect(permission).toContainText(prepared.preparedRuntimeCapsuleIds[0]!)
    await expect(permission).toContainText(requested.scopeHash)
    await expect(permission).toContainText('Chromium')

    // Keep a second tab on the original permission while the first loses the action response.
    const duplicate = await context.newPage()
    await duplicate.goto(chatUrl)
    const staleButton = duplicate.getByRole('button', { name: 'Allow and run these tests' })
    await expect(staleButton).toBeEnabled()
    const actionUrl = (url: URL) => url.pathname === chatPath
    let responseDropped = false
    await page.route(actionUrl, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fetch({ maxRetries: 0 })
      await route.abort()
      responseDropped = true
    })
    await permission.getByRole('button', { name: 'Allow and run these tests' }).click()
    await expect.poll(() => checkoutVisits).toBe(1)
    await expect.poll(() => responseDropped).toBe(true)
    const original = await client.qualityJourneyExecutionCycle.findFirstOrThrow({ where, include: { testRuns: true } })
    expect(original.testRuns).toHaveLength(1)
    const originalRun = original.testRuns[0]!
    expect(
      await client.qualityJourneyExecutionConsent.findUniqueOrThrow({ where: { id: requested.id } }),
    ).toMatchObject({
      status: 'CONSUMED',
      executionCycleId: original.id,
      grantSource: 'UI',
    })

    await staleButton.click()
    await expect(duplicate.getByRole('article', { name: 'Activity' })).toBeVisible()
    await duplicate.close()
    await page.unroute(actionUrl)
    await page.reload()
    const activity = page.getByRole('article', { name: 'Activity' })
    await expect(activity).toBeVisible()
    await expect(activity.getByRole('link', { name: 'View test run' })).toHaveAttribute(
      'href',
      `/test-runs/${originalRun.testRunId}?project=${targetProjectId}`,
    )
    const providers = page.getByRole('region', { name: 'Lookup provider' })
    await providers.getByRole('button', { name: 'Use ChatGPT for lookups' }).click()
    await expect(providers.getByText('Lookup provider · ChatGPT')).toBeVisible()
    await expect(activity).toBeVisible()

    releaseCheckout()
    await expect
      .poll(() => client.testRun.findUnique({ where: { id: originalRun.testRunId } }))
      .toMatchObject({
        status: 'COMPLETED',
        result: 'FAILED',
      })
    await expect(activity).toContainText('Failed', { timeout: 20_000 })
    const report = await client.report.findFirstOrThrow({ where: { testRunId: originalRun.testRunId } })
    const steps = await client.reportStep.findMany({
      where: { reportScenario: { reportFeature: { reportId: report.id } } },
      orderBy: { order: 'asc' },
    })
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ status: 'PASSED' })
    const failedStep = steps[1]!
    expect(failedStep).toMatchObject({ status: 'FAILED' })
    expect(failedStep.name).toContain('Order number:')
    expect(failedStep.screenshotPath).toBeTruthy()
    const evidence = await client.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
      where: { executionCycleId: original.id, testRunId: originalRun.testRunId },
    })
    const evidenceJson = JSON.parse(evidence.evidenceJson) as {
      artifacts: Array<{ kind: string; reportStepId?: string; testCaseId?: string }>
    }
    expect(evidenceJson.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'screenshot', reportStepId: failedStep.id, testCaseId: 'case-execution' }),
      ]),
    )
    const result = page.getByRole('article', { name: 'Result and evidence' })
    await expect(result).toContainText('Order number:')
    const evidenceLink = result.getByRole('link', { name: 'Show me where' })
    await expect(evidenceLink).toHaveAttribute(
      'href',
      `/reports/${report.id}?project=${targetProjectId}&step=${failedStep.id}#step-evidence`,
    )
    const evidenceHref = `/reports/${report.id}?project=${targetProjectId}&step=${failedStep.id}#step-evidence`
    await evidenceLink.click()
    await expect(page).toHaveURL(new URL(evidenceHref, baseURL!).toString())
    const stepEvidence = page.getByRole('region', { name: 'Step evidence' })
    await expect(stepEvidence).toContainText('Order number:')
    await expect(stepEvidence).toContainText('Failed')
    const screenshot = stepEvidence.getByRole('img', { name: /Screenshot for/ })
    const screenshotPath = await screenshot.getAttribute('src')
    expect(screenshotPath).toBe(`/api/reports/steps/${failedStep.id}/screenshot?targetProjectId=${targetProjectId}`)
    const screenshotResponse = await page.request.get(screenshotPath!)
    expect(screenshotResponse.status()).toBe(200)
    expect(screenshotResponse.headers()['content-type']).toContain('image/png')
    expect((await screenshotResponse.body()).byteLength).toBeGreaterThan(100)
    const crossProjectScreenshot = await page.request.get(
      `/api/reports/steps/${failedStep.id}/screenshot?targetProjectId=target-execution-passed`,
    )
    expect(crossProjectScreenshot.status()).toBe(404)
    await page.reload()
    await expect(page).toHaveURL(new URL(evidenceHref, baseURL!).toString())
    await expect(stepEvidence).toContainText('Order number:')
    await expect(stepEvidence.getByRole('img', { name: /Screenshot for/ })).toHaveAttribute('src', screenshotPath!)

    await page.goto(`/test-runs/${originalRun.testRunId}?project=${targetProjectId}`)
    const manualReport = page.getByRole('link', { name: 'View Report' })
    await expect(manualReport).toHaveAttribute('href', `/reports/${report.id}?project=${targetProjectId}`)
    await manualReport.click()
    const manualEvidence = page.getByRole('link', { name: /Failed step.*Order number:/ })
    await expect(manualEvidence).toHaveAttribute('href', evidenceHref)
    await manualEvidence.click()
    await expect(stepEvidence).toContainText('Order number:')

    await page.goto(chatUrl)
    await page.getByRole('textbox', { name: 'Message' }).fill('Show me where')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(new URL(evidenceHref, baseURL!).toString())
    await expect(page.getByRole('region', { name: 'Step evidence' })).toContainText('Order number:')

    expect(checkoutFixture('pause', journeyId, targetProjectId)).toEqual({ operationalStatus: 'PAUSED' })
    await page.goto(chatUrl)
    await expect(activity).toContainText('The Journey is paused.')
    await expect(activity).toContainText('Failed')
    await expect(activity.getByRole('link', { name: 'View test run' })).toHaveAttribute(
      'href',
      `/test-runs/${originalRun.testRunId}?project=${targetProjectId}`,
    )
    expect(await client.qualityJourneyExecutionCycle.count({ where })).toBe(1)
    expect(await client.qualityJourneyExecutionConsent.count({ where })).toBe(1)
    expect(await client.runtimeCapsuleExecutionAttempt.count({ where: { testRunId: originalRun.testRunId } })).toBe(1)
    expect(checkoutVisits).toBe(1)
  } finally {
    releaseCheckout()
    if (target.listening) await new Promise<void>(resolve => target.close(() => resolve()))
    await client.$disconnect()
    await rm(workspace, { recursive: true, force: true })
  }
})

test('saved checkout chat physically passes one independently authorized checkout attempt', async ({
  page,
  context,
  baseURL,
}) => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl?.startsWith('file:') || databaseUrl.includes('project.db')) {
    throw new Error('The checkout fixture requires a disposable SQLite database.')
  }
  const client = new PrismaClient({ datasources: { db: { url: `${databaseUrl}?connection_limit=1` } } })
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-chat-checkout-passed-'))
  let checkoutVisits = 0
  const target = createServer((request, response) => {
    if (request.url !== '/checkout') return void response.writeHead(404).end()
    checkoutVisits++
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><title>Guest checkout</title><main><h1>Guest checkout</h1></main>')
  })
  try {
    await new Promise<void>((resolve, reject) => {
      target.once('error', reject)
      target.listen(0, '127.0.0.1', resolve)
    })
    const address = target.address()
    if (!address || typeof address === 'string') throw new Error('Checkout fixture has no local address.')
    const prepared = checkoutFixture<{
      targetProjectId: string
      journeyId: string
      conversationId: string
      preparedRuntimeCapsuleIds: string[]
    }>('seed', workspace, `http://127.0.0.1:${address.port}/checkout`, 'passed')
    const { targetProjectId, journeyId, conversationId } = prepared
    const where = { targetProjectId, journeyId }
    await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
    await page.goto(`/conversations/${conversationId}?project=${targetProjectId}`)
    await page.getByRole('button', { name: 'Review run permission' }).click()
    const permission = page.getByRole('article', { name: 'Run permission' })
    await expect(permission).toContainText(prepared.preparedRuntimeCapsuleIds[0]!)
    expect(await client.qualityJourneyExecutionCycle.count({ where })).toBe(0)
    expect(checkoutVisits).toBe(0)
    await permission.getByRole('button', { name: 'Allow and run these tests' }).click()
    await expect.poll(() => checkoutVisits).toBe(1)
    const cycle = await client.qualityJourneyExecutionCycle.findFirstOrThrow({ where, include: { testRuns: true } })
    expect(cycle.testRuns).toHaveLength(1)
    const run = cycle.testRuns[0]!
    await expect
      .poll(() => client.testRun.findUnique({ where: { id: run.testRunId } }))
      .toMatchObject({
        status: 'COMPLETED',
        result: 'PASSED',
      })
    await expect(page.getByRole('article', { name: 'Activity' })).toContainText('Passed', { timeout: 20_000 })
    await page.reload()
    await expect(page.getByRole('article', { name: 'Activity' })).toContainText('Passed')
    expect(await client.qualityJourneyExecutionCycle.count({ where })).toBe(1)
    expect(await client.runtimeCapsuleExecutionAttempt.count({ where: { testRunId: run.testRunId } })).toBe(1)
    expect(checkoutVisits).toBe(1)
  } finally {
    if (target.listening) await new Promise<void>(resolve => target.close(() => resolve()))
    await client.$disconnect()
    await rm(workspace, { recursive: true, force: true })
  }
})
