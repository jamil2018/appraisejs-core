import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { expect, test, type Locator, type Page } from '@playwright/test'
import prisma from '../src/config/db-config'
import { createTargetProjectFixture } from '../src/test/migrated-test-database'
import { hashQualityJourneyExecutionValue as hash, hashQualityJourneyRequirement } from '../src/lib/quality-journey'
import { confirmQualityJourneyDraft } from '../src/services/coordinator/quality-journey-draft-service'
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

async function confirmFixtureDraft(draft: {
  id: string
  targetProjectId: string
  version: number
  draftHash: string
  requirementJson: string
}) {
  return confirmQualityJourneyDraft(
    {
      draftId: draft.id,
      targetProjectId: draft.targetProjectId,
      expectedVersion: draft.version,
      expectedDraftHash: draft.draftHash,
      requirementHash: hashQualityJourneyRequirement(JSON.parse(draft.requirementJson)),
      hostingMode: 'APP_SERVER_LOCAL_V1',
    },
    prisma,
  )
}

test('Journey saves one brief and returns from guided setup by keyboard at a narrow viewport @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(process.env.APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED === 'true', 'This fixture uses an unavailable Codex.')
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
  for (const name of ['Provider', 'Model', 'Effort']) {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('combobox', { name, exact: true })).toBeFocused()
  }
  await expect(page.getByRole('button', { name: 'Start journey', exact: true })).toBeDisabled()
  const setup = page.getByRole('link', { name: 'See options', exact: true })
  await page.keyboard.press('Tab')
  await expect(setup).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Set up Codex', { exact: true })).toBeVisible()
  const draftPath = `/quality-journeys/drafts/${saved.id}?project=${targetProjectId}`
  const returnLink = page.getByRole('link', { name: 'Return to your brief' }).first()
  await expect(returnLink).toHaveAttribute('href', draftPath)
  await returnLink.focus()
  await page.keyboard.press('Enter')
  await expect(brief).toHaveValue('Check guest checkout.')
  expect(await prisma.qualityJourney.count({ where: { targetProjectId } })).toBe(0)
  // The canonical fixture keeps the existing Journey surface checks independent of native sign-in.
  const { journeyId } = await confirmFixtureDraft(saved)
  await page.goto(`/quality-journeys/${journeyId}?project=${targetProjectId}`)
  const journey = await prisma.qualityJourney.findFirstOrThrow({ where: { targetProjectId } })
  expect(journey).toMatchObject({ hostingMode: 'APP_SERVER_LOCAL_V1', stage: 'ANALYSIS' })
  await expect(page.getByRole('heading', { name: 'Check guest checkout.' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Journey stages' }).locator('[aria-current="step"]')).toHaveText(
    'Requirements',
  )
  const currentFocus = page.getByRole('region', { name: 'Current journey focus' })
  await expect(currentFocus.locator('a[href^="/settings/agent-setup?"]')).toBeVisible()
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

test('Claude stays selected after reopening the brief and cannot fall back to Codex', async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(process.env.APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED === 'true', 'This fixture uses unavailable Claude Code.')
  const targetProjectId = await projectFixture()
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  await page.goto(`/quality-journeys/new?project=${targetProjectId}`)
  await page.getByRole('textbox', { name: 'What do you want to validate?' }).fill('Verify the disposable checkout.')
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('CLAUDE_CODE')
  await expect
    .poll(() => prisma.qualityJourneyDraft.findFirst({ where: { targetProjectId, status: 'ACTIVE' } }))
    .toMatchObject({ managedWorkerProvider: 'CLAUDE_CODE' })
  const draft = await prisma.qualityJourneyDraft.findFirstOrThrow({ where: { targetProjectId, status: 'ACTIVE' } })
  await page.goto(`/quality-journeys/drafts/${draft.id}?project=${targetProjectId}`)
  const selector = page.getByRole('combobox', { name: 'Provider', exact: true })
  await expect(selector).toHaveValue('CLAUDE_CODE')
  await expect(page.getByRole('button', { name: 'Start journey', exact: true })).toBeDisabled()
  const { journeyId } = await confirmFixtureDraft(draft)
  await page.goto(`/quality-journeys/${journeyId}?project=${targetProjectId}`)
  const journey = await prisma.qualityJourney.findFirstOrThrow({ where: { targetProjectId } })
  expect(journey).toMatchObject({ managedWorkerProvider: 'CLAUDE_CODE', stage: 'ANALYSIS' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Verify the disposable checkout.' })).toBeVisible()
  const focus = page.getByRole('region', { name: 'Current journey focus' })
  const journeyPath = `/quality-journeys/${journey.id}?project=${targetProjectId}`
  const settings = focus.locator('a[href^="/settings/agent-setup?"]')
  const params = new URLSearchParams({
    provider: 'CLAUDE_CODE',
    project: targetProjectId,
    returnTo: journeyPath + '#current-work',
  })
  await expect(settings).toHaveAttribute('href', `/settings/agent-setup?${params.toString()}`)
  const otherProjectId = await projectFixture()
  await context.addCookies([{ name: 'appraise-active-project', value: otherProjectId, url: baseURL! }])
  await settings.click()
  await expect(page.getByText('Set up Claude Code', { exact: true })).toBeVisible()
  const goBack = page.getByRole('link', { name: 'Return to your brief' }).first()
  await expect(goBack).toHaveAttribute('href', journeyPath + '#current-work')
  await goBack.click()
  await expect(page.getByRole('heading', { name: 'Verify the disposable checkout.' })).toBeVisible()
  expect(await prisma.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: journey.id } } })).toBe(0)
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
function runAnalysisFixtureCommand<T>(input: unknown): T {
  // The tsx child loads canonical JSON-backed operation contracts that Playwright's TS loader cannot load.
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'e2e/helpers/quality-journey-analysis-fixture.ts', JSON.stringify(input)],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
  )
  const line = output.split('\n').find(value => value.startsWith('APPRAISE_E2E_FIXTURE='))
  if (!line) throw new Error('Canonical Analysis fixture did not return its durable identity.')
  return JSON.parse(line.slice('APPRAISE_E2E_FIXTURE='.length)) as T
}

function runAnalysisFixture(input: {
  targetProjectId: string
  questions: FixtureQuestion[]
  orderNumberPilot?: { journeyId: string; predecessorRevisionId: string } | true
  successor?: { journeyId: string; predecessorRevisionId: string }
}) {
  return runAnalysisFixtureCommand<{
    targetProjectId: string
    journey: { journeyId: string }
    revisionId: string
  }>(input)
}

async function analysisFixture(questions: FixtureQuestion[] = []) {
  return runAnalysisFixture({ targetProjectId: await projectFixture(), questions })
}

test('a saved checkout chat renders the published checks once and restores them on reload', async ({
  page,
  context,
  baseURL,
}) => {
  const { targetProjectId, journey, revisionId } = await analysisFixture()
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const where = { id: journey.journeyId }
  const before = await prisma.qualityJourney.findUniqueOrThrow({ where })
  const revision = await prisma.qualityJourneyAnalysisRevision.findUniqueOrThrow({ where: { id: revisionId } })
  expect(JSON.parse(before.activeRevisionIdsJson).analysis).toBe(revision.artifactRevisionId)
  expect(before.analysisReviewHash).toMatch(/^sha256:[0-9a-f]{64}$/)

  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL!).origin) externalRequests.push(url.origin)
  })
  await page.goto(`/quality-journeys/${journey.journeyId}?project=${targetProjectId}`)
  await page.getByRole('link', { name: 'Discuss in chat' }).click()
  const composer = page.getByRole('textbox', { name: 'Message' })
  await composer.fill('Keep these checkout checks in this chat.')
  await composer.press('Enter')
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
  const savedPath = new URL(page.url())
  const savedId = savedPath.pathname.split('/').at(-1)!
  const saved = await prisma.projectConversation.findUniqueOrThrow({
    where: { id: savedId },
    include: { messages: true },
  })
  expect(saved.targetProjectId).toBe(targetProjectId)
  expect(JSON.parse(saved.messages[0].contextJson!)).toMatchObject({ kind: 'QUALITY_JOURNEY', id: journey.journeyId })

  const card = page.getByRole('article', { name: 'Proposed checks' })
  const checks = card.getByRole('list', { name: 'Proposed checks' }).getByRole('listitem')
  const link = card.getByRole('link', { name: 'Review this version' })
  await expect(card).toHaveCount(1)
  await expect(checks).toHaveText(['An order ID is shown'])
  await expect(card.getByText(new RegExp(`test approach revision ${revision.revision}\\.`))).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(savedPath.href)
  await expect(card).toHaveCount(1)
  await expect(checks).toHaveText(['An order ID is shown'])
  await expect(link).toHaveAttribute(
    'href',
    `/quality-journeys/${journey.journeyId}?project=${targetProjectId}#analysis`,
  )
  await expect(
    page.getByRole('list', { name: 'Messages' }).getByText('Keep these checkout checks in this chat.'),
  ).toBeVisible()
  expect(await prisma.qualityJourney.findUniqueOrThrow({ where })).toMatchObject({
    stateHash: before.stateHash,
    version: before.version,
  })
  expect(await prisma.projectConversationMessage.count({ where: { conversationId: savedId } })).toBe(
    saved.messages.length,
  )
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

test('checkout chat recovers the changed criterion after a missed update and fences the old review', async ({
  page,
  context,
  baseURL,
}) => {
  const targetProjectId = await projectFixture()
  const { journey, revisionId } = runAnalysisFixture({ targetProjectId, questions: [], orderNumberPilot: true })
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const journeyPath = `/quality-journeys/${journey.journeyId}?project=${targetProjectId}`
  const request = 'Also check that I get an order number.'
  const requestEvents = { journeyId: journey.journeyId, eventType: 'COMMAND_REQUEST_ANALYSIS_REVISION' }
  await page.goto(journeyPath)
  await page.getByRole('link', { name: 'Discuss in chat' }).click()
  const composer = page.getByRole('textbox', { name: 'Message' })
  await composer.fill('Keep the checkout review in this chat.')
  await composer.press('Enter')
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
  const path = new URL(page.url())
  const conversationId = path.pathname.split('/').at(-1)!
  const initial = page.getByRole('article', { name: 'Proposed checks' })
  await expect(initial).toContainText('The confirmation page is shown')
  await expect(initial).toContainText('Only the selected item is purchased')
  await composer.fill(request)
  await composer.press('Enter')
  const transcript = page.getByRole('list', { name: 'Messages' })
  await expect(transcript.getByText('Revision requested.', { exact: false })).toBeVisible()
  await expect(initial).toHaveCount(0)
  const feedback = await prisma.qualityJourneyArtifact.findFirstOrThrow({
    where: { journeyId: journey.journeyId, kind: 'ANALYSIS_REVISION_FEEDBACK' },
  })
  expect(JSON.parse(feedback.artifactJson)).toMatchObject({ reviewedRevisionId: revisionId, feedback: request })
  expect(await prisma.qualityJourneyEvent.count({ where: requestEvents })).toBe(1)

  await context.setOffline(true)
  const successor = runAnalysisFixture({
    targetProjectId,
    questions: [],
    orderNumberPilot: { journeyId: journey.journeyId, predecessorRevisionId: revisionId },
  })
  const changes = page.getByRole('article', { name: 'Review changes' })
  await expect(changes).toHaveCount(0)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(changes).toHaveCount(1)
  await expect(changes).toContainText('Test approach revision 2.')
  await expect(changes).toContainText('The order confirmation includes an order number.')
  await expect(changes).toContainText('An order ID is shown')
  await expect(changes).not.toContainText(/selected item/)
  await page.reload()
  await expect(changes).toContainText('Test approach revision 2.')
  await expect(transcript.getByText(request, { exact: true })).toHaveCount(1)

  await composer.fill('Find test cases for checkout')
  await composer.press('Enter')
  await expect(transcript.getByText('Find test cases for checkout', { exact: true })).toBeVisible()
  const lookup = await prisma.projectConversationMessage.findFirstOrThrow({
    where: { conversationId, role: 'USER', content: 'Find test cases for checkout' },
  })
  const providers = page.getByRole('region', { name: 'Lookup provider' })
  await providers.getByRole('button', { name: 'Use ChatGPT for lookups' }).click()
  await expect(providers.getByText('Lookup provider · ChatGPT')).toBeVisible()
  const original = await prisma.projectConversationRead.create({
    data: {
      conversationId,
      messageId: lookup.id,
      provider: 'CHATGPT',
      state: 'RUNNING',
      blockedConversationId: conversationId,
      expiresAt: new Date(0),
    },
  })
  await page.reload()
  await expect(changes).toHaveCount(1)
  await expect(providers.getByRole('button', { name: 'Use local lookups' })).toBeDisabled()
  await providers.getByRole('button', { name: 'Acknowledge unresolved lookup' }).click()
  await providers.getByRole('button', { name: 'Use local lookups' }).click()
  await expect(providers.getByText('Lookup provider · Local')).toBeVisible()
  await expect(transcript.getByText('ChatGPT lookup outcome unknown · Acknowledged')).toBeVisible()
  await expect(changes).toContainText('Test approach revision 2.')
  expect(await prisma.projectConversationRead.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
    state: 'UNKNOWN',
    blockedConversationId: null,
  })
  expect(await prisma.projectConversationRead.count({ where: { conversationId } })).toBe(1)

  const manual = await context.newPage()
  await manual.goto(journeyPath)
  await manual.getByRole('button', { name: 'Request change: The order confirmation includes an order number.' }).click()
  await manual.getByRole('textbox', { name: 'Your requested change' }).fill('Show where the order number is visible.')
  await manual.getByRole('button', { name: 'Send change', exact: true }).click()
  await expect.poll(() => prisma.qualityJourneyEvent.count({ where: requestEvents })).toBe(2)
  await manual.close()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(changes).toHaveCount(0)
  await expect(transcript.getByText(request, { exact: true })).toHaveCount(1)
  expect(
    await prisma.qualityJourneyAnalysisRevision.count({
      where: { journeyId: journey.journeyId, id: successor.revisionId },
    }),
  ).toBe(1)
})

for (const approvalMethod of ['typed reply', 'button'] as const) {
  test(`checkout chat approves the exact Analysis revision by ${approvalMethod}`, async ({
    page,
    context,
    baseURL,
  }) => {
    const targetProjectId = await projectFixture()
    const question = {
      questionId: 'CHECKOUT-TARGET',
      prompt: 'Which environment should guest checkout use?',
      rationale: 'The target determines where the checks will be prepared.',
      required: true,
      suggestedAnswers: ['Staging checkout', 'Test sandbox'],
    }
    const fixture = runAnalysisFixture({
      targetProjectId,
      questions: approvalMethod === 'typed reply' ? [question] : [],
    })
    const { journeyId } = fixture.journey
    await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
    const path = `/quality-journeys/${journeyId}?project=${targetProjectId}`
    await page.goto(path)
    await page.getByRole('link', { name: 'Discuss in chat' }).click()
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.fill('Keep the scoped checkout review here.')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const chatUrl = new URL(page.url())
    const conversationId = chatUrl.pathname.split('/').at(-1)!
    const transcript = page.getByRole('list', { name: 'Messages' })

    let revisionId = fixture.revisionId
    if (approvalMethod === 'typed reply') {
      const card = page.getByRole('article', { name: 'Question' })
      await expect(card).toContainText(question.prompt)
      await expect(card.getByRole('list', { name: 'Suggested answers' })).toContainText('Staging checkout')
      await composer.fill('Answer: Staging checkout')
      await composer.press('Enter')
      await expect(transcript.getByText('Answer recorded for this Journey.')).toBeVisible()
      await expect(card).toHaveCount(0)
      const answer = await prisma.qualityJourneyAnalysisAnswer.findFirstOrThrow({
        where: { journeyId },
        include: { question: true, artifact: true },
      })
      expect(answer.question).toMatchObject({ analysisRevisionId: revisionId, questionId: question.questionId })
      expect(JSON.parse(answer.artifact.artifactJson)).toMatchObject({ targetProjectId, answer: 'Staging checkout' })
      revisionId = runAnalysisFixture({
        targetProjectId,
        questions: [],
        successor: { journeyId, predecessorRevisionId: revisionId },
      }).revisionId
      await page.reload()
    }
    const review = page.getByRole('article', { name: 'Proposed checks' })
    await expect(review).toBeVisible()
    await expect(review.getByRole('button', { name: 'Approve criteria' })).toHaveCount(0)
    if (approvalMethod === 'typed reply') {
      await composer.fill('Approve criteria')
      await composer.press('Enter')
      await expect(page.locator('#conversation-composer').getByRole('alert')).toContainText(
        'Discovery setup is incomplete',
      )
      await expect(transcript.getByText('Approve criteria', { exact: true })).toHaveCount(0)
      await composer.fill('')
    }
    await prisma.environment.create({
      data: { name: 'Staging checkout', baseUrl: 'https://checkout.example.test', targetProjectId },
    })
    const checkoutModule = await prisma.module.create({ data: { name: 'Checkout', targetProjectId } })
    await prisma.locatorGroup.create({
      data: { name: 'Checkout', route: '/checkout', moduleId: checkoutModule.id, targetProjectId },
    })
    await page.reload()
    const approve = review.getByRole('button', { name: 'Approve criteria' })
    await expect(approve).toBeVisible()
    const current = await prisma.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
    const analysis = await prisma.qualityJourneyAnalysisRevision.findUniqueOrThrow({ where: { id: revisionId } })
    const analysisReview = {
      journeyId,
      revisionId: analysis.artifactRevisionId,
      reviewHash: current.analysisReviewHash,
      stateHash: current.stateHash,
    }
    const idempotencyKey: string = randomUUID()
    const request = {
      targetProjectId,
      conversationId,
      idempotencyKey,
      content: 'Approve criteria',
      analysisReview,
    }
    const probe = (approvalProbe: typeof request) =>
      runAnalysisFixtureCommand<{ outcome: string; replayed?: boolean }>({ approvalProbe })
    expect(probe({ ...request, targetProjectId: await projectFixture() })).toEqual({ outcome: 'NOT_FOUND' })
    const staleRevisionId = approvalMethod === 'typed reply' ? fixture.revisionId : 'unreviewed'
    expect(probe({ ...request, analysisReview: { ...analysisReview, revisionId: staleRevisionId } })).toEqual({
      outcome: 'CONFLICT',
    })
    expect(await prisma.qualityJourneyAnalysisDecision.count({ where: { journeyId } })).toBe(0)

    if (approvalMethod === 'typed reply') {
      await composer.fill(request.content)
      await composer.press('Enter')
    } else {
      await composer.fill('Keep this unsent draft')
      await approve.click()
      await expect(composer).toHaveValue('Keep this unsent draft')
    }
    const label = `Test approach revision ${analysis.revision} approved.`
    await expect(transcript.getByText(label)).toBeVisible()
    await expect(review).toHaveCount(0)
    const saved = await prisma.projectConversationMessage.findFirstOrThrow({
      where: { conversationId, role: 'USER', content: request.content },
    })
    expect(probe({ ...request, idempotencyKey: saved.idempotencyKey! })).toEqual({
      outcome: 'COMMITTED',
      replayed: true,
    })
    expect(probe(request)).toEqual({ outcome: 'CONFLICT' })
    const decisions = await prisma.qualityJourneyAnalysisDecision.findMany({ where: { journeyId } })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({
      analysisRevisionId: revisionId,
      reviewHash: analysisReview.reviewHash,
      decision: 'APPROVED',
    })
    expect(
      await prisma.qualityJourneyEvent.count({
        where: { journeyId, eventType: 'COMMAND_DECIDE_ANALYSIS' },
      }),
    ).toBe(1)
    await page.reload()
    await expect(transcript.getByText(label)).toHaveCount(1)
    await page.goto(path)
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  })
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
  await expect(page.locator('a[href^="/settings/agent-setup?"]')).toHaveCount(0)
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
