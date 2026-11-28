import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { hashQualityJourneyExecutionValue as hash } from '../src/lib/quality-journey'
import { createTargetProjectFixture } from '../src/test/migrated-test-database'

function fixture<T>(script: string, ...args: string[]): T {
  const output = execFileSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 90_000,
  })
  const line = output.split('\n').find(value => value.startsWith('APPRAISE_E2E_FIXTURE='))
  if (!line) throw new Error(`The disposable ${script} fixture returned no scope.`)
  return JSON.parse(line.slice('APPRAISE_E2E_FIXTURE='.length)) as T
}

function analysis(input: object) {
  return fixture<{ journey: { journeyId: string }; revisionId: string }>(
    'e2e/helpers/quality-journey-analysis-fixture.ts',
    JSON.stringify(input),
  )
}

async function continuePilot(
  workspace: string,
  baseUrl: string,
  journeyId: string,
  projectId: string,
  review: () => Promise<void>,
) {
  const worker = spawn(process.execPath, [
    '--import',
    'tsx',
    'e2e/helpers/chat-first-checkout-pilot-fixture.ts',
    'continue-reviewed',
    workspace,
    baseUrl,
    journeyId,
    projectId,
  ])
  const completion = once(worker, 'close')
  let diagnostics = ''
  worker.stderr.setEncoding('utf8').on('data', chunk => {
    diagnostics = (diagnostics + chunk).slice(-8000)
  })
  const lines = createInterface({ input: worker.stdout })
  let result:
    | { journeyId: string; targetProjectId: string; environmentId: string; preparedRuntimeCapsuleIds: string[] }
    | undefined
  try {
    for await (const line of lines) {
      if (line === 'APPRAISE_E2E_SCENARIO_READY') {
        await review()
        worker.stdin.end('continue\n')
      }
      if (line.startsWith('APPRAISE_E2E_FIXTURE=')) result = JSON.parse(line.slice('APPRAISE_E2E_FIXTURE='.length))
    }
    const [code] = await completion
    if (code !== 0 || !result) throw new Error(`The Journey preparation fixture did not complete. ${diagnostics}`)
    return result
  } finally {
    lines.close()
    if (worker.exitCode === null) worker.kill()
  }
}

test('one saved brief keeps its Journey identity through revision, approval, preparation and checkout', async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000)
  const variant = process.env.CF06_PILOT_VARIANT === 'failed' ? 'failed' : 'passed'
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl?.startsWith('file:') || databaseUrl.includes('project.db'))
    throw new Error('The pilot requires a disposable SQLite database.')
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-chat-pilot-'))
  const targetProjectId = randomUUID()
  let checkoutVisits = 0
  const target = createServer((request, response) => {
    if (request.url !== '/checkout') return void response.writeHead(404).end()
    checkoutVisits++
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        variant === 'failed'
          ? '<!doctype html><title>Order confirmed</title><main id="confirmation"><h1>Order confirmed</h1><p>The purchase was submitted.</p></main>'
          : '<!doctype html><title>Order number: LOCAL-123</title><main id="confirmation"><h1>Order confirmed</h1><p>Order number: LOCAL-123</p></main>',
      )
  })
  try {
    await new Promise<void>((resolve, reject) => {
      target.once('error', reject)
      target.listen(0, '127.0.0.1', resolve)
    })
    const address = target.address()
    if (!address || typeof address === 'string') throw new Error('The checkout target has no local address.')
    const baseUrl = `http://127.0.0.1:${address.port}/checkout`
    await createTargetProjectFixture(prisma, {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `e2e-pilot:${targetProjectId}`,
      canonicalPath: workspace,
      displayName: 'Disposable checkout pilot',
      fingerprint: hash(targetProjectId),
    })
    await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])

    await page.goto(`/quality-journeys/new?project=${targetProjectId}`)
    const brief = page.getByRole('textbox', { name: 'What do you want to validate?' })
    await brief.fill('Check guest checkout and its order confirmation.')
    await page.getByRole('button', { name: 'Start journey', exact: true }).click()
    await expect(page).toHaveURL(/quality-journeys\/qjy_[^/?]+\?project=/)
    const journey = await prisma.qualityJourney.findFirstOrThrow({ where: { targetProjectId } })
    const journeyId = journey.id
    await page.getByRole('link', { name: 'Discuss in chat' }).click()
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.fill('Keep this checkout Journey in this chat.')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const chatUrl = page.url()
    const conversationId = new URL(chatUrl).pathname.split('/').at(-1)!
    const linked = await prisma.projectConversationMessage.findFirstOrThrow({
      where: { conversationId, role: 'USER' },
      orderBy: { ordinal: 'desc' },
    })
    expect(JSON.parse(linked.contextJson!)).toMatchObject({ kind: 'QUALITY_JOURNEY', id: journeyId })

    const v1 = analysis({ targetProjectId, existing: { journeyId }, questions: [], orderNumberPilot: true })
    expect(v1.journey.journeyId).toBe(journeyId)
    await page.reload()
    const proposed = page.getByRole('article', { name: 'Proposed checks' })
    await expect(proposed).toContainText('The confirmation page is shown')
    const manual = await context.newPage()
    await manual.goto(`/quality-journeys/${journeyId}?project=${targetProjectId}`)
    await manual.getByRole('button', { name: 'Request change: An order confirmation appears.' }).click()
    await manual.getByRole('textbox', { name: 'Your requested change' }).fill('Also check that I get an order number.')
    await manual.getByRole('button', { name: 'Send change', exact: true }).click()
    await expect
      .poll(() => prisma.qualityJourneyArtifact.count({ where: { journeyId, kind: 'ANALYSIS_REVISION_FEEDBACK' } }))
      .toBe(1)
    await manual.close()
    const v2 = analysis({
      targetProjectId,
      questions: [],
      orderNumberPilot: { journeyId, predecessorRevisionId: v1.revisionId },
    })
    expect(v2.journey.journeyId).toBe(journeyId)
    await page.reload()
    const changes = page.getByRole('article', { name: 'Review changes' })
    await expect(changes).toContainText('The order confirmation includes an order number.')
    await expect(changes).toContainText('An order ID is shown')

    await prisma.environment.create({
      data: { id: 'm10-environment', name: 'M10 disposable', baseUrl, targetProjectId },
    })
    await prisma.module.create({ data: { id: 'm10-module', name: 'M10 checkout', targetProjectId } })
    await prisma.locatorGroup.create({
      data: {
        id: 'm10-locators',
        name: 'M10 checkout',
        route: '/checkout',
        moduleId: 'm10-module',
        targetProjectId,
      },
    })
    expect(fixture<{ registryReady: boolean }>('e2e/helpers/chat-first-checkout-pilot-fixture.ts', 'registry')).toEqual(
      { registryReady: true },
    )
    await page.reload()
    await expect(changes.getByRole('button', { name: 'Approve criteria' })).toBeEnabled()
    await changes.getByRole('button', { name: 'Approve criteria' }).click()
    await expect(page.getByRole('list', { name: 'Messages' })).toContainText('Test approach revision 2 approved.')
    const decisions = await prisma.qualityJourneyAnalysisDecision.findMany({ where: { journeyId } })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({ analysisRevisionId: v2.revisionId, decision: 'APPROVED' })
    expect(await prisma.qualityJourney.count({ where: { targetProjectId } })).toBe(1)

    const prepared = await continuePilot(workspace, baseUrl, journeyId, targetProjectId, async () => {
      await page.goto(chatUrl)
      await expect(page.getByText('Test scenarios', { exact: true })).toBeVisible()
      if (variant === 'passed') {
        const stale = await context.newPage()
        await stale.goto(chatUrl)
        await stale.getByRole('textbox', { name: 'Message' }).fill('Approve pending scenarios')
        await composer.fill('Approve pending scenarios')
        await composer.press('Enter')
        await expect(page.getByRole('list', { name: 'Messages' })).toContainText('1 scenario approved.')
        await stale.getByRole('textbox', { name: 'Message' }).press('Enter')
        await expect(stale.getByRole('alert').filter({ hasText: /changed|stale/i })).toBeVisible()
        await stale.close()
      } else {
        const scenarioReview = await context.newPage()
        await scenarioReview.goto(`/quality-journeys/${journeyId}?project=${targetProjectId}#scenarios`)
        await scenarioReview.getByRole('button', { name: 'Approve pending scenarios', exact: true }).click()
        await expect
          .poll(() => prisma.qualityJourneyScenarioDecision.count({ where: { portfolioRevision: { journeyId } } }))
          .toBe(1)
        await scenarioReview.close()
      }
    })
    expect(prepared).toMatchObject({ journeyId, targetProjectId, environmentId: 'm10-environment' })
    expect(prepared.preparedRuntimeCapsuleIds).toHaveLength(1)
    expect(await prisma.qualityJourney.count({ where: { targetProjectId } })).toBe(1)
    expect(
      await prisma.qualityJourneyScenarioDecision.count({
        where: { portfolioRevision: { journeyId }, decision: 'APPROVED' },
      }),
    ).toBe(1)
    expect(checkoutVisits).toBe(0)

    await page.goto(chatUrl)
    await page.getByRole('button', { name: 'Review run permission' }).click()
    const permission = page.getByRole('article', { name: 'Run permission' })
    await expect(permission).toContainText(prepared.preparedRuntimeCapsuleIds[0]!)
    expect(await prisma.qualityJourneyExecutionCycle.count({ where: { journeyId } })).toBe(0)
    await permission.getByRole('button', { name: 'Allow and run these tests' }).click()
    await expect.poll(() => checkoutVisits).toBeGreaterThan(0)
    const cycle = await prisma.qualityJourneyExecutionCycle.findFirstOrThrow({
      where: { journeyId },
      include: { testRuns: true },
    })
    expect(cycle.testRuns).toHaveLength(1)
    const run = cycle.testRuns[0]!
    await expect
      .poll(() => prisma.testRun.findUnique({ where: { id: run.testRunId } }))
      .toMatchObject({
        status: 'COMPLETED',
        result: variant === 'failed' ? 'FAILED' : 'PASSED',
      })
    const resultCard = page.getByRole('article', { name: 'Result and evidence' })
    await expect(resultCard).toContainText(variant === 'failed' ? 'Failed' : 'Passed')
    const receipt = await prisma.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
      where: { executionCycleId: cycle.id, testRunId: run.testRunId },
    })
    const report = await prisma.report.findFirstOrThrow({ where: { testRunId: run.testRunId, targetProjectId } })
    expect(receipt.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    const reportSteps = await prisma.reportStep.findMany({
      where: { reportScenario: { reportFeature: { reportId: report.id } } },
      orderBy: { order: 'asc' },
    })
    expect(reportSteps.some(step => step.status === 'PASSED')).toBe(true)
    if (variant === 'failed') {
      const failedStep = reportSteps.find(step => step.status === 'FAILED')
      expect(failedStep?.name).toBe('assert page title')
      expect(failedStep?.errorMessage).toContain('Order number: LOCAL-123')
      await expect(resultCard.getByRole('link', { name: 'Show me where' })).toHaveAttribute(
        'href',
        `/reports/${report.id}?project=${targetProjectId}&step=${failedStep!.id}#step-evidence`,
      )
    } else {
      expect(reportSteps.every(step => step.status === 'PASSED')).toBe(true)
    }
    if (process.env.CF13_VERIFY_RERUN === 'true') {
      const firstReceiptHash = receipt.receiptHash
      const firstRunId = run.testRunId
      const firstScenarioRevisionId = (
        JSON.parse(cycle.preparedCapsulesJson) as Array<{ scenarioRevisionId: string }>
      )[0]!.scenarioRevisionId
      const activity = page.getByRole('article', { name: 'Activity' })
      const scenario = activity.getByRole('checkbox')
      await expect(scenario).toHaveCount(1)
      await scenario.uncheck()
      await expect(activity.getByRole('button', { name: 'Propose selected rerun' })).toHaveCount(0)
      await scenario.check()
      await activity
        .getByRole('textbox', { name: 'Reason for rerun' })
        .fill('Verify the sealed checkout evidence again.')
      await activity.getByRole('button', { name: 'Propose selected rerun' }).click()

      const reruns = page.getByRole('region', { name: 'Selective reruns' })
      await expect(reruns).toContainText('Selective rerun · PROPOSED')
      const proposal = await prisma.qualityJourneyExecutionRerunProposal.findFirstOrThrow({
        where: { journeyId, sourceExecutionCycleId: cycle.id },
      })
      expect(JSON.parse(proposal.sourceEvidenceJson)).toEqual([receipt.id])
      expect(JSON.parse(proposal.selectedScenariosJson)).toEqual([firstScenarioRevisionId])
      await reruns.getByText('Rerun details').click()
      await expect(reruns).toContainText(proposal.proposalHash)
      await reruns.getByRole('button', { name: 'Approve this rerun scope' }).click()
      await expect(reruns).toContainText('Selective rerun · APPROVED')
      await reruns.getByRole('button', { name: 'Start approved rerun' }).click()
      await expect(reruns).toContainText('Allow these tests to run?')
      expect(await prisma.qualityJourneyExecutionCycle.count({ where: { journeyId } })).toBe(1)
      const rerunConsent = await prisma.qualityJourneyExecutionConsent.findFirstOrThrow({
        where: { journeyId, status: 'REQUESTED', executionCycleId: null },
      })
      expect(JSON.parse(rerunConsent.scopeJson)).toMatchObject({
        preparedRuntimeCapsuleIds: prepared.preparedRuntimeCapsuleIds,
      })
      await reruns.getByRole('button', { name: 'Allow these tests', exact: true }).click()
      await expect(reruns).toContainText('Permission granted')
      await reruns.getByRole('button', { name: 'Start approved rerun' }).click()
      await expect.poll(() => prisma.qualityJourneyExecutionCycle.count({ where: { journeyId } })).toBe(2)
      const successor = await prisma.qualityJourneyExecutionCycle.findFirstOrThrow({
        where: { journeyId, predecessorExecutionCycleId: cycle.id },
        include: { testRuns: true },
      })
      expect(successor.testRuns).toHaveLength(1)
      expect(successor.testRuns[0]!.testRunId).not.toBe(firstRunId)
      await expect
        .poll(() => prisma.testRun.findUnique({ where: { id: successor.testRuns[0]!.testRunId } }))
        .toMatchObject({ status: 'COMPLETED', result: 'PASSED' })
      await page.reload()
      await expect(page.getByRole('article', { name: 'Activity' })).toContainText('Completed')
      await expect(page.getByRole('article', { name: 'Result and evidence' })).toContainText('Passed')
      expect(
        await prisma.qualityJourneyExecutionRerunProposal.findUniqueOrThrow({ where: { id: proposal.id } }),
      ).toMatchObject({
        status: 'STARTED',
        successorExecutionCycleId: successor.id,
      })
      expect(
        await prisma.qualityJourneyExecutionEvidenceReceipt.findUniqueOrThrow({ where: { id: receipt.id } }),
      ).toMatchObject({
        testRunId: firstRunId,
        receiptHash: firstReceiptHash,
      })
      expect(
        await prisma.qualityJourneyExecutionEvidenceReceipt.count({ where: { executionCycleId: successor.id } }),
      ).toBe(1)
      expect(await prisma.qualityJourneyExecutionCycle.count({ where: { journeyId } })).toBe(2)
    }
    if (process.env.CF14_VERIFY_EXPORT === 'true') {
      const otherProjectId = randomUUID()
      const otherWorkspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-chat-pilot-other-'))
      const exactRun = await prisma.testRun.findUniqueOrThrow({ where: { id: run.testRunId } })
      try {
        await createTargetProjectFixture(prisma, {
          id: otherProjectId,
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `e2e-pilot-other:${otherProjectId}`,
          canonicalPath: otherWorkspace,
          displayName: 'Other disposable project',
          fingerprint: hash(otherProjectId),
        })
        const otherTab = await context.newPage()
        try {
          await otherTab.goto(`/projects?project=${targetProjectId}`)
          await otherTab.getByRole('button', { name: 'Select Other disposable project' }).click()
          await expect
            .poll(async () => {
              const selected = (await context.cookies()).find(cookie => cookie.name === 'appraise-active-project')
              return selected?.value
            })
            .toBe(otherProjectId)
        } finally {
          await otherTab.close()
        }
        await page.goto(`/reports/${report.id}?project=${targetProjectId}`)
        const exportLink = page.getByRole('link', { name: 'Download recorded run artifacts' })
        await expect(exportLink).toHaveAttribute(
          'href',
          `/api/test-runs/${encodeURIComponent(exactRun.runId)}/download?targetProjectId=${targetProjectId}`,
        )
        const downloadPromise = page.waitForEvent('download')
        await exportLink.click()
        const download = await downloadPromise
        expect((await stat(await download.path())).size).toBeGreaterThan(0)
        const foreign = await page.request.get(
          `/api/test-runs/${encodeURIComponent(exactRun.runId)}/download?targetProjectId=${otherProjectId}`,
        )
        expect(foreign.status()).toBe(404)
        await page.goto(chatUrl)
      } finally {
        await rm(otherWorkspace, { recursive: true, force: true })
      }
    }
    const provider = page.getByRole('region', { name: 'Lookup provider' })
    await provider.getByRole('button', { name: 'Use ChatGPT for lookups' }).click()
    await expect(provider.getByText('Lookup provider · ChatGPT')).toBeVisible()
    await page.reload()
    await expect(resultCard).toContainText(variant === 'failed' ? 'Failed' : 'Passed')
    if (process.env.CF12_CLOSE_PILOT === 'true') {
      const published = fixture<{ reportRevisionId: string }>(
        'e2e/helpers/chat-first-checkout-pilot-fixture.ts',
        'triage',
        journeyId,
        targetProjectId,
        cycle.id,
      )
      expect(published.reportRevisionId).toBeTruthy()
      await page.reload()
      const closure = page.getByRole('region', { name: 'Terminal journey review' })
      const note = closure.getByRole('textbox', { name: 'Risk acceptance rationale' })
      if (variant === 'failed') {
        const close = closure.getByRole('button', { name: 'Accept risks and close journey' })
        await expect(close).toBeDisabled()
        await note.fill('The failed check is intentionally recorded by this disposable pilot.')
        await closure.getByRole('checkbox').check()
        await close.click()
      } else {
        await closure.getByRole('button', { name: 'Approve report and close journey' }).click()
      }
      await expect(closure).toContainText('Journey closed')
      await page.reload()
      await expect(closure).toContainText('Journey closed')
      await expect(resultCard).toContainText(variant === 'failed' ? 'Failed' : 'Passed')
    } else {
      expect(
        fixture<{ operationalStatus: string }>(
          'e2e/helpers/chat-first-checkout-pilot-fixture.ts',
          'pause',
          journeyId,
          targetProjectId,
        ),
      ).toEqual({ operationalStatus: 'PAUSED' })
      await page.reload()
      await expect(resultCard).toContainText(variant === 'failed' ? 'Failed' : 'Passed')
      await expect(page.getByRole('article', { name: 'Activity' })).toContainText('The Journey is paused.')
    }
    expect(await prisma.qualityJourneyExecutionCycle.count({ where: { journeyId } })).toBe(
      process.env.CF13_VERIFY_RERUN === 'true' ? 2 : 1,
    )
    expect(await prisma.qualityJourneyExecutionConsent.count({ where: { journeyId } })).toBe(
      process.env.CF13_VERIFY_RERUN === 'true' ? 2 : 1,
    )
  } finally {
    if (target.listening) await new Promise<void>(resolve => target.close(() => resolve()))
    await rm(workspace, { recursive: true, force: true })
  }
})
