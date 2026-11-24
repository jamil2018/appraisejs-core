import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, test, type Locator, type Page } from '@playwright/test'
import prisma from '../src/config/db-config'
import { createTargetProjectFixture } from '../src/test/migrated-test-database'
import { hashQualityJourneyExecutionValue as hash } from '../src/lib/quality-journey'
import { createAppManagedJourney } from '../src/services/coordinator/quality-journey-service'

async function projectFixture() {
  const targetProjectId = randomUUID()
  await createTargetProjectFixture(prisma, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `e2e-brief:${targetProjectId}`,
    canonicalPath: `/tmp/${targetProjectId}`,
    displayName: 'Disposable brief browser test',
    fingerprint: hash(targetProjectId),
  })
  return targetProjectId
}

async function expectWorkspaceAlignment(panel: Locator, width: 'compact' | 'full') {
  await expect(panel).toBeVisible()
  await expect
    .poll(() =>
      panel.evaluate(element => {
        const workspace = element.closest('#main-content')
        if (!workspace) throw new Error('The Journey is outside the app content area.')
        const style = getComputedStyle(workspace)
        const bounds = workspace.getBoundingClientRect()
        const panelBounds = element.getBoundingClientRect()
        const leadingSpace = panelBounds.left - (bounds.left + parseFloat(style.paddingLeft))
        const trailingSpace = bounds.right - parseFloat(style.paddingRight) - panelBounds.right
        return {
          centered: Math.abs(leadingSpace - trailingSpace) < 2,
          compact: Math.min(leadingSpace, trailingSpace) > 32,
          full: Math.max(Math.abs(leadingSpace), Math.abs(trailingSpace)) < 2,
        }
      }),
    )
    .toMatchObject({ centered: true, [width]: true })
}

test('Journey starts from one autosaved brief using keyboard at a narrow viewport @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const targetProjectId = await projectFixture()
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const errors: string[] = []
  const failures: string[] = []
  function observePage(openPage: Page) {
    openPage.on('pageerror', error => errors.push(error.message))
    openPage.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url())
    })
  }

  observePage(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/quality-journeys/new?project=${targetProjectId}`)
  await expect(page.getByRole('textbox')).toHaveCount(1)
  const brief = page.getByRole('textbox', { name: 'What do you want to validate?' })
  await expectWorkspaceAlignment(page.locator('form').filter({ has: brief }), 'compact')
  await page.setViewportSize({ width: 320, height: 900 })
  await brief.fill('Check guest checkout.')
  await expect(page.getByText('Saved to this workspace', { exact: true })).toBeVisible()
  const saved = await prisma.qualityJourneyDraft.findFirstOrThrow({ where: { targetProjectId, status: 'ACTIVE' } })
  expect(JSON.parse(saved.requirementJson)).toEqual({ objective: await brief.inputValue() })
  expect(await prisma.qualityJourney.count({ where: { targetProjectId } })).toBe(0)
  await brief.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Start journey', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/quality-journeys\/qjy_[^/?]+\?project=/)
  const journey = await prisma.qualityJourney.findFirstOrThrow({ where: { targetProjectId } })
  expect(journey).toMatchObject({ hostingMode: 'APP_SERVER_LOCAL_V1', stage: 'ANALYSIS' })
  await expect(page.getByRole('heading', { name: 'Check guest checkout.' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Journey stages' }).locator('[aria-current="step"]')).toHaveText(
    'Requirements',
  )
  const currentFocus = page.getByRole('region', { name: 'Current journey focus' })
  await expect(currentFocus.getByText('Agent setup needed', { exact: true })).toBeVisible()
  await currentFocus.getByText('How to connect the agent', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(currentFocus.getByText('Your brief stays saved here.', { exact: false })).toBeVisible()
  await expect(page.locator('#execution')).toHaveCount(0)
  await page.getByText('History', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Original brief' })).toBeVisible()
  // A fresh document checks persistence without canceling the first page's speculative requests during unload.
  const reopened = await context.newPage()
  observePage(reopened)
  await reopened.setViewportSize({ width: 320, height: 900 })
  await reopened.goto(page.url())
  await expect(reopened.getByRole('heading', { name: 'Check guest checkout.' })).toBeVisible()
  expect(await prisma.qualityJourney.count({ where: { targetProjectId } })).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
  expect(failures).toEqual([])

  await reopened.getByRole('link', { name: 'Discuss in chat' }).click()
  await expect(reopened.getByRole('heading', { name: 'What are you working on?' })).toBeVisible()
  const activity = reopened.getByRole('article', { name: 'Activity' })
  const focus = activity.getByRole('link')
  await expect(focus).toHaveAttribute('href', new RegExp(`/quality-journeys/${journey.id}\\?project=`))
  const chat = reopened.getByRole('textbox', { name: 'Message' })
  await chat.fill('Keep the guest checkout Journey in this chat.')
  await chat.press('Enter')
  await expect(reopened).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
  await reopened.reload()
  await expect(focus).toBeVisible()
  await expect(reopened.getByRole('list', { name: 'Messages' }).getByText('Check guest checkout.')).toBeVisible()
  const unchanged = await prisma.qualityJourney.findUniqueOrThrow({ where: { id: journey.id } })
  expect(unchanged.stateHash).toBe(journey.stateHash)
})

test('Journey stage map remains readable for incomplete lifecycle snapshots @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const targetProjectId = await projectFixture()
  const { journey } = await createAppManagedJourney({
    targetProjectId,
    idempotencyKey: randomUUID(),
    requirement: { objective: 'Partial lifecycle display' },
  })
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // These partial records exercise display at each stage without running the lifecycle transitions.
  for (const [stage, label] of [
    ['INTAKE', 'Requirements'],
    ['ANALYSIS', 'Requirements'],
    ['ANALYSIS_REVIEW', 'Requirements'],
    ['DISCOVERY', 'Scenarios'],
    ['SCENARIO_DESIGN', 'Scenarios'],
    ['SCENARIO_REVIEW', 'Scenarios'],
    ['AUTOMATION', 'Test run'],
    ['EXECUTION', 'Test run'],
    ['TRIAGE', 'Results'],
    ['REPORT_REVIEW', 'Results'],
    ['CLOSED', 'Results'],
  ] as const) {
    await prisma.qualityJourney.update({
      where: { id: journey.journeyId },
      data: { stage, status: stage === 'CLOSED' ? 'CLOSED' : 'ACTIVE' },
    })
    await page.goto(`/quality-journeys/${journey.journeyId}?project=${targetProjectId}`)
    await expect(page.getByRole('list', { name: 'Journey stages' }).locator('li')).toHaveText([
      'Requirements',
      'Scenarios',
      'Test run',
      'Results',
    ])
    await expect(page.getByRole('list', { name: 'Journey stages' }).locator('[aria-current="step"]')).toHaveText(label)
    await expect(page.getByRole('region', { name: 'Current journey focus' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})

// Canonical fixture authoring never invokes a native sender.
type FixtureQuestion = {
  questionId: string
  prompt: string
  rationale: string
  required: boolean
  suggestedAnswers?: string[]
}
async function analysisFixture(questions: FixtureQuestion[] = []) {
  const targetProjectId = await projectFixture()
  // The tsx child loads canonical JSON-backed operation contracts that Playwright's TS loader cannot load.
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'e2e/helpers/quality-journey-analysis-fixture.ts',
      JSON.stringify({ targetProjectId, questions }),
    ],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
  )
  const line = output.split('\n').find(value => value.startsWith('APPRAISE_E2E_FIXTURE='))
  if (!line) throw new Error('Canonical Analysis fixture did not return its durable identity.')
  return JSON.parse(line.slice('APPRAISE_E2E_FIXTURE='.length)) as {
    targetProjectId: string
    journey: { journeyId: string }
    revisionId: string
  }
}

test('Journey acceptance criteria show item feedback and retain drafts through reload @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const { targetProjectId, journey, revisionId } = await analysisFixture()
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(`/quality-journeys/${journey.journeyId}?project=${targetProjectId}`)
  await expect(page.getByRole('region', { name: 'Acceptance criteria review' })).toContainText(
    'An order confirmation appears.',
  )
  await expect(page.getByRole('textbox')).toHaveCount(0)
  const requestCriterionChange = page.getByRole('button', { name: 'Request change: An order confirmation appears.' })
  await requestCriterionChange.click()
  await expect(page.getByRole('textbox')).toHaveCount(1)
  const criterionFeedback = page.getByRole('textbox', { name: 'Your requested change' })
  await criterionFeedback.fill('Also cover a declined payment.')
  await expect(page.getByRole('button', { name: 'Send change', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0)
  await page.reload()
  await requestCriterionChange.click()
  await expect(criterionFeedback).toHaveValue('Also cover a declined payment.')
  await page.getByRole('button', { name: 'Send change', exact: true }).click()
  await expect
    .poll(() =>
      prisma.qualityJourneyEvent.count({
        where: { journeyId: journey.journeyId, eventType: 'COMMAND_REQUEST_ANALYSIS_REVISION' },
      }),
    )
    .toBe(1)
  const feedbackArtifact = await prisma.qualityJourneyArtifact.findFirstOrThrow({
    where: { journeyId: journey.journeyId, kind: 'ANALYSIS_REVISION_FEEDBACK' },
  })
  expect(JSON.parse(feedbackArtifact.artifactJson)).toMatchObject({
    reviewedRevisionId: revisionId,
    feedback:
      'Appraise item feedback v1:\n' +
      JSON.stringify({
        general: '',
        items: [{ kind: 'obligation', id: 'AC-CONFIRM', feedback: 'Also cover a declined payment.' }],
      }),
  })
  await page.reload()
  expect(
    await prisma.qualityJourneyEvent.count({
      where: { journeyId: journey.journeyId, eventType: 'COMMAND_REQUEST_ANALYSIS_REVISION' },
    }),
  ).toBe(1)
  await page.getByText('History', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Original brief' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Journey suggested answers support keyboard selection and survive refresh at 320px @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const payment = {
    questionId: 'PAYMENT-METHOD',
    prompt: 'Which payment method should checkout cover?',
    rationale: 'Payment method changes the required coverage.',
    required: true,
    suggestedAnswers: ['Cards only', 'Cards and wallets'],
  }
  const environment = {
    questionId: 'CHECKOUT-ENVIRONMENT',
    prompt: 'Which checkout environment should be used?',
    rationale: 'Choose an environment before running checkout tests.',
    required: true,
    suggestedAnswers: ['Staging checkout', 'Test sandbox'],
  }
  const { targetProjectId, journey } = await analysisFixture([payment, environment])
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/quality-journeys/${journey.journeyId}?project=${targetProjectId}`)
  await expectWorkspaceAlignment(page.getByRole('region', { name: 'Current journey focus' }), 'full')
  await page.setViewportSize({ width: 320, height: 900 })
  const currentQuestion = page.getByRole('region', { name: 'Current essential question' })
  await expect(currentQuestion).toBeVisible()
  // Both questions can share a creation timestamp. Follow the order rendered by the Journey.
  const paymentFirst = await page.getByRole('heading', { name: payment.prompt }).isVisible()
  const [first, second] = paymentFirst ? [payment, environment] : [environment, payment]
  const firstAnswer = first.suggestedAnswers[0]
  const secondAnswer = second.suggestedAnswers[0]
  await expect(page.getByRole('heading', { name: first.prompt })).toBeVisible()
  await expect(page.getByText('How to connect the agent', { exact: true })).toHaveCount(0)
  const recommendation = page.getByRole('button', { name: `${firstAnswer} · Recommended`, exact: true })
  await recommendation.focus()
  await page.keyboard.press('Space')
  await expect(recommendation).toHaveAttribute('aria-pressed', 'true')
  const answer = currentQuestion.getByRole('textbox', { name: /^Your answer\s*:/ })
  await expect(answer).toHaveValue(firstAnswer)
  expect(await prisma.qualityJourneyAnalysisAnswer.count({ where: { journeyId: journey.journeyId } })).toBe(0)
  await page.reload()
  await expect(answer).toHaveValue(firstAnswer)
  await page.getByRole('button', { name: 'Record answer', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => prisma.qualityJourneyAnalysisAnswer.count({ where: { journeyId: journey.journeyId } }))
    .toBe(1)
  const recorded = await prisma.qualityJourneyAnalysisAnswer.findFirstOrThrow({
    where: { journeyId: journey.journeyId },
    include: { artifact: true, question: true },
  })
  expect(recorded.question.questionId).toBe(first.questionId)
  expect(JSON.parse(recorded.artifact.artifactJson).answer).toBe(firstAnswer)
  await expect(page.getByRole('heading', { name: second.prompt })).toBeFocused()
  await answer.fill(secondAnswer)
  await page.getByRole('button', { name: 'Record answer', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Acceptance criteria', exact: true })).toBeFocused()
  await page.reload()
  await page.getByText('Saved answers (2)', { exact: true }).click()
  const focus = page.getByRole('region', { name: 'Current journey focus' })
  await focus.getByText(first.prompt, { exact: true }).click()
  await expect(focus.getByRole('paragraph').filter({ hasText: firstAnswer })).toHaveText(firstAnswer)
  expect(await prisma.qualityJourneyAnalysisAnswer.count({ where: { journeyId: journey.journeyId } })).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
