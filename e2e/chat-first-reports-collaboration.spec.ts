import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

test.describe('Chat-first report evidence and comparison', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
    const failedCase = await prisma.testRunTestCase.findFirstOrThrow({
      where: { testRunId: seededIds.failedTestRun, testCaseId: seededIds.testCase },
      select: { id: true },
    })
    await prisma.report.create({
      data: {
        id: `e2e-comparison-${randomUUID()}`,
        name: 'E2E Failed Run Report',
        testRunId: seededIds.failedTestRun,
        targetProjectId: seededIds.targetProject,
        testCases: {
          create: {
            testCaseId: seededIds.testCase,
            testRunTestCaseId: failedCase.id,
            duration: '1ms',
          },
        },
      },
    })
  })
  test.afterAll(disconnectPrisma)

  test('compares exact same-project reports and preserves report links after reload', async ({ page }) => {
    const project = seededIds.targetProject
    const failedReport = await prisma.report.findFirstOrThrow({
      where: { testRunId: seededIds.failedTestRun, targetProjectId: project },
      select: { id: true },
    })
    await page.goto(`/reports?project=${project}`)
    await expect(page.getByRole('heading', { name: 'Compare two reports' })).toBeVisible()
    await page.getByLabel('Baseline report').selectOption(seededIds.report)
    await page.getByLabel('Candidate report').selectOption(failedReport.id)
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
    await expect(page).toHaveURL(
      new RegExp(`/reports\\?project=${project}.*baseline=${seededIds.report}.*candidate=${failedReport.id}`),
    )
    const comparison = page.getByRole('region', { name: 'Compared report case outcomes' })
    await expect(comparison.getByRole('row', { name: /E2E seeded login works.*PASSED.*FAILED/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'E2E Completed Run' }).first()).toHaveAttribute(
      'href',
      `/reports/${seededIds.report}?project=${project}`,
    )
    await page.reload()
    await expect(comparison.getByRole('row', { name: /E2E seeded login works.*PASSED.*FAILED/i })).toBeVisible()

    await page.goto(`/reports?project=${project}&baseline=${seededIds.report}&candidate=foreign-report`)
    await expect(page.getByText('Scoped report comparison was not found.')).toBeVisible()
  })

  test('saved chat reports only durable scoped report facts', async ({ page }) => {
    const project = seededIds.targetProject
    await page.goto(`/conversations/new?project=${project}`)
    await page.getByRole('textbox', { name: 'Message' }).fill('Show recent reports')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const transcript = page.getByRole('list', { name: 'Messages' })
    await expect(transcript.getByText(/E2E Completed Run/)).toBeVisible()
    await expect(transcript.getByText(/E2E Failed Run/)).toBeVisible()
    await page.reload()
    await expect(transcript.getByText(/E2E Completed Run/)).toBeVisible()
  })
})

const execFile = promisify(execFileCallback)
const workspaces: string[] = []

async function git(cwd: string, ...args: string[]) {
  await execFile('git', ['-C', cwd, ...args], { maxBuffer: 1024 * 1024 })
}

async function collaborationFixture(
  mode: 'connect' | 'prepare-review',
  projectId: string,
  repositoryRoot: string,
  conversationId?: string,
) {
  const { stdout } = await execFile(
    process.execPath,
    [
      '--import',
      'tsx',
      'src/test/chat-first-collaboration-fixture.ts',
      mode,
      projectId,
      repositoryRoot,
      ...(conversationId ? [conversationId] : []),
    ],
    { cwd: process.cwd(), env: process.env, maxBuffer: 1024 * 1024 },
  )
  return stdout.trim().split('\n').at(-1)!
}

async function localCollaborationFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-chat-collaboration-'))
  workspaces.push(workspace)
  const repositoryRoot = path.join(workspace, 'repo')
  const remote = path.join(workspace, 'remote.git')
  await fs.mkdir(repositoryRoot)
  await execFile('git', ['init', '--initial-branch=appraise-0.5', repositoryRoot])
  await git(repositoryRoot, 'config', 'user.email', 'fixture@example.test')
  await git(repositoryRoot, 'config', 'user.name', 'Fixture')
  await fs.writeFile(path.join(repositoryRoot, 'README.md'), 'local fixture\n')
  await git(repositoryRoot, 'add', 'README.md')
  await git(repositoryRoot, 'commit', '-m', 'initial')
  await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', remote])
  await git(repositoryRoot, 'remote', 'add', 'origin', remote)
  await git(repositoryRoot, 'push', '-u', 'origin', 'appraise-0.5')
  const bindingId = await collaborationFixture('connect', seededIds.targetProject, repositoryRoot)
  return { repositoryRoot, bindingId }
}

test.describe('Chat-first collaboration operation', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterAll(async () => {
    await disconnectPrisma()
    await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
  })

  test('prepares once in saved chat, restores original operation, and binds an exact receive decision', async ({
    page,
  }) => {
    const { repositoryRoot, bindingId } = await localCollaborationFixture()
    const project = seededIds.targetProject
    await page.goto(`/conversations/new?project=${project}`)
    const message = page.getByRole('textbox', { name: 'Message' })
    await message.fill('Show reports')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const conversationId = new URL(page.url()).pathname.split('/').at(-1)!
    await message.fill('Prepare publication')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByRole('list', { name: 'Messages' }).getByText(/Prepared operation recorded/i)).toBeVisible()
    const first = await prisma.collaborationOperation.findFirstOrThrow({
      where: { bindingId, intent: 'PUBLISH' },
      orderBy: { createdAt: 'desc' },
    })
    const operationLink = page.getByRole('link', { name: /Review collaboration operation/i })
    const operationHref = new URL((await operationLink.getAttribute('href'))!, page.url())
    expect(operationHref.pathname).toBe('/collaboration')
    expect(operationHref.searchParams.get('project')).toBe(project)
    expect(operationHref.searchParams.get('operation')).toBe(first.id)
    expect(operationHref.hash).toBe('#operation-history')
    await page.reload()
    await message.fill('Show collaboration status')
    await page.getByRole('button', { name: 'Send message' }).click()
    expect(await prisma.collaborationOperation.count({ where: { bindingId, intent: 'PUBLISH' } })).toBe(1)

    const preparedId = await collaborationFixture('prepare-review', project, repositoryRoot, conversationId)
    const prepared = await prisma.collaborationOperation.findUniqueOrThrow({ where: { id: preparedId } })
    expect(prepared.state).toBe('WAITING_FOR_DECISION')
    await page.reload()
    const review = page.getByRole('region', { name: 'Exact collaboration review' })
    await expect(review.getByText(prepared.id)).toBeVisible()
    const useIncoming = review.getByRole('button', { name: 'Use all incoming' })
    await expect(useIncoming).toBeDisabled()
    await review.getByRole('checkbox', { name: /reviewed this exact operation/i }).click()
    await useIncoming.click()
    await expect(
      page.getByRole('list', { name: 'Messages' }).getByText(/Collaboration decision recorded/i),
    ).toBeVisible()
    await page.reload()
    await expect
      .poll(async () => {
        const operation = await prisma.collaborationOperation.findUniqueOrThrow({ where: { id: prepared.id } })
        return operation.state
      })
      .toBe('COMPLETED')
  })
})
