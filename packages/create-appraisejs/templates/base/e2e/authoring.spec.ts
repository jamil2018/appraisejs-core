import { test, expect, type Page } from '@playwright/test'

import {
  disconnectPrisma,
  resetE2eData,
  seedCoreData,
  seedInvalidTopologyTestCase,
  seededIds,
} from './helpers/test-data'
import {
  addStepDefinitionToFlow,
  createTestCaseWithSeededStep,
  fillTestCaseDetails,
  saveTestCase,
  selectStepDefinitionForFlow,
} from './helpers/forms'
import { expectPageHeading } from './helpers/ui'

async function expectNoAuthoringHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const fits = (element: Element | null) => !element || element.scrollWidth <= element.clientWidth
        return {
          document: document.documentElement.scrollWidth <= window.innerWidth,
          viewport: document.body.scrollWidth <= window.innerWidth,
          flow: fits(document.querySelector('[aria-label="Graph step editor"], [aria-label="Linear step editor"]')),
          editor: fits(document.querySelector('[role="dialog"][aria-labelledby="step-invocation-editor-title"]')),
        }
      }),
    )
    .toEqual({ document: true, viewport: true, flow: true, editor: true })
}

async function switchAuthoringView(page: Page, view: 'Graph' | 'Linear'): Promise<void> {
  const tab = page.getByRole('tab', { name: view })
  if (await tab.isVisible().catch(() => false)) {
    await tab.click()
    return
  }
  await page.getByRole('button', { name: view }).click()
}

test.describe('Test authoring @authoring', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('inline tag and test suite dialogs add selectable records', async ({ page }) => {
    await page.goto('/test-cases/create')
    await expectPageHeading(page, 'Create New Test Case')
    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Inline Dialog Case')

    await page.getByRole('button', { name: 'Create filter tag' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Inline Tag')
    await page.getByRole('textbox', { name: 'Tag Expression', exact: true }).fill('@e2e-inline')
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByRole('button', { name: 'E2E Inline Tag' })).toBeVisible()

    await page.getByRole('button', { name: 'Create test suite' }).click()
    await page.getByLabel('Name').fill('E2E Inline Suite')
    await page.getByLabel('Module').click()
    await page.getByRole('option', { name: 'E2E Auth' }).click()
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByRole('button', { name: 'E2E Inline Suite' })).toBeVisible()
  })

  test('flow panel mounts on modify page and scenario preview shows seeded steps', async ({ page }) => {
    await page.goto(`/test-cases/modify/${seededIds.testCase}`)
    await expectPageHeading(page, 'Modify Test Case')
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.getByText('Test Case Flow', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Show test scenario preview' }).click()
    await expect(page.getByText('Test Scenario(Preview)')).toBeVisible()
    await expect(page.locator('.cm-content')).toContainText('Given the user navigates to the / url')
  })

  test('full create flow adds a Step Definition invocation before saving', async ({ page }) => {
    await createTestCaseWithSeededStep(page, 'E2E Authored Case')
    await page.goto('/test-cases')
    await expect(page.getByText('E2E Authored Case', { exact: true }).first()).toBeVisible()
  })

  test('Graph and Linear authoring views preserve typed invocations and canonical order through save and reload', async ({
    page,
  }) => {
    const title = 'E2E Dual View Case'
    await page.goto('/test-cases/create')
    await expectPageHeading(page, 'Create New Test Case')
    await fillTestCaseDetails(page, title)

    await expect(page.getByRole('tab', { name: 'Graph', selected: true })).toBeVisible()
    await addStepDefinitionToFlow(page)
    await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()

    await selectStepDefinitionForFlow(page, 'Set viewport size')
    await expect(page.getByRole('dialog', { name: 'Configure step parameters' })).toBeVisible()
    await page.getByLabel('width').fill('1440')
    await page.getByLabel('height').fill('900')
    await page.getByRole('button', { name: 'Save step' }).dispatchEvent('click')
    await expect(page.getByRole('dialog', { name: 'Configure step parameters' })).toBeHidden()

    await page.getByRole('tab', { name: 'Linear' }).click()
    await expect(page.getByLabel('Linear step editor')).toBeVisible()
    await expect(page.getByText('When the user navigates to the / url')).toBeVisible()
    await page.getByRole('button', { name: 'Move Set viewport size up' }).click()
    await expect(page.getByRole('button', { name: 'Move Set viewport size up' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Move Navigate to URL up' })).toBeEnabled()
    await page
      .getByRole('button', { name: 'Move Navigate to URL up' })
      .locator('..')
      .getByRole('button', { name: 'Edit' })
      .click()
    await page.getByRole('textbox', { name: 'url' }).fill('/linear')
    await page.getByRole('button', { name: 'Save step' }).click()
    await expect(page.getByText('When the user navigates to the /linear url')).toBeVisible()

    await page.getByRole('tab', { name: 'Graph' }).click()
    await expect(page.getByLabel('Graph step editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()

    await saveTestCase(page)
    const row = page.getByRole('row', { name: new RegExp(title) })
    await row.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await expectPageHeading(page, 'Modify Test Case')
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('tab', { name: 'Linear' }).click()
    await expect(page.getByText('When the user navigates to the /linear url')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Move Set viewport size up' })).toBeDisabled()
    await page.getByRole('tab', { name: 'Graph' }).click()
    await page.locator('[data-invocation-edit]').last().click()
    await page.getByRole('textbox', { name: 'url' }).fill('/graph-reloaded')
    await page.getByRole('button', { name: 'Save step' }).click()
    await page.getByRole('tab', { name: 'Linear' }).click()
    await expect(page.getByText('When the user navigates to the /graph-reloaded url')).toBeVisible()
    await saveTestCase(page)
  })

  test('invalid typed graph input remains invalid after a view switch instead of being silently persisted', async ({
    page,
  }) => {
    await page.goto('/test-cases/create')
    await expectPageHeading(page, 'Create New Test Case')
    await fillTestCaseDetails(page, 'E2E Invalid Typed Input Case')

    await selectStepDefinitionForFlow(page, 'Set viewport size')
    await page.getByLabel('width').fill('1280')
    await page.getByLabel('height').fill('720')
    await page.getByRole('button', { name: 'Save step' }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByLabel('width').fill('')
    await page.getByRole('button', { name: 'Save step' }).click()
    await expect(page.getByText('width is required.')).toBeVisible()
    await page.getByRole('button', { name: 'Close step details' }).click()

    await page.getByRole('tab', { name: 'Linear' }).click()
    await expect(page.getByLabel('Linear step editor')).toBeVisible()
    await page.getByRole('tab', { name: 'Graph' }).click()
    await expect(page.getByLabel('Graph step editor')).toBeVisible()
    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(page).toHaveURL(/\/test-cases$/)
    await expect(page.getByText('E2E Invalid Typed Input Case', { exact: true }).first()).toBeVisible()
  })

  test('normal and immersive graph editing retain focus without console or request failures', async ({ page }) => {
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedRequests: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
        failedRequests.push(`${request.method()} ${request.url()}`)
      }
    })

    await page.goto('/test-cases/create')
    await expectPageHeading(page, 'Create New Test Case')
    await fillTestCaseDetails(page, 'E2E Immersive Editing Case')
    await addStepDefinitionToFlow(page)
    await expectNoAuthoringHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Configure step parameters' })
    await expect(editor).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'url' })).toBeFocused()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Enter immersive flow editing' }).click()
    await expect(page.getByRole('button', { name: 'Exit immersive flow editing' })).toBeVisible()
    await page.waitForTimeout(500)
    const immersiveEditButton = page.getByRole('button', { name: 'Edit', exact: true })
    await immersiveEditButton.focus()
    await page.keyboard.press('Enter')
    await expect(editor).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'url' })).toBeFocused()
    await expectNoAuthoringHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Cancel' }).click()

    const exitImmersiveButton = page.getByRole('button', { name: 'Exit immersive flow editing' })
    await exitImmersiveButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Enter immersive flow editing' })).toBeVisible()
    await expect(editor).toBeHidden()
    await expectNoAuthoringHorizontalOverflow(page)

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    expect(failedRequests).toEqual([])
  })

  test('rejects persisted non-contiguous flow-block topology before saving', async ({ page }) => {
    await seedInvalidTopologyTestCase()
    await page.goto(`/test-cases/modify/${seededIds.invalidTopologyTestCase}`)
    await expectPageHeading(page, 'Modify Test Case')
    await fillTestCaseDetails(page, 'E2E Invalid Topology Case')
    await expect(page.getByLabel('Graph step editor')).toBeVisible()

    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(page).toHaveURL(new RegExp(`/test-cases/modify/${seededIds.invalidTopologyTestCase}$`))
    await expect(
      page.getByText('Flow blocks must contain distinct, contiguous nodes from the authored flow.'),
    ).toBeVisible()
  })

  test('create from template keeps converted invocations available in Graph and Linear views', async ({ page }) => {
    await page.goto(`/test-cases/create-from-template?templateTestCaseId=${seededIds.templateTestCase}`)
    await expectPageHeading(page, 'Create Test Case From Template')
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('E2E Login Template')

    await fillTestCaseDetails(page, 'E2E Login Template')
    await expect(page.getByLabel('Graph step editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()
    await page.getByRole('tab', { name: 'Linear' }).click()
    await expect(page.getByLabel('Linear step editor')).toBeVisible()
    await expect(page.getByText('When the user navigates to the / url')).toBeVisible()
    await page.getByRole('tab', { name: 'Graph' }).click()
    await expect(page.getByLabel('Graph step editor')).toBeVisible()
  })

  test('template authoring persists the same linear invocation editor through save, reload, and graph projection', async ({
    page,
  }) => {
    await page.goto('/template-test-cases/create')
    await expectPageHeading(page, 'Create Template Test Case')
    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Template Dual View Case')
    await addStepDefinitionToFlow(page)

    await switchAuthoringView(page, 'Linear')
    await expect(page.getByLabel('Linear step editor')).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'url' }).fill('/template-linear')
    await page.getByRole('button', { name: 'Save step' }).click()
    await expect(page.getByText('When the user navigates to the /template-linear url')).toBeVisible()

    await switchAuthoringView(page, 'Graph')
    await expect(page.getByLabel('Graph step editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/\/template-test-cases$/)

    const row = page.getByRole('row', { name: /E2E Template Dual View Case/ })
    await row.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('link', { name: 'Edit' }).click()
    await expectPageHeading(page, 'Modify Template Test Case')
    await switchAuthoringView(page, 'Linear')
    await expect(page.getByText('When the user navigates to the /template-linear url')).toBeVisible()
    await switchAuthoringView(page, 'Graph')
    await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()
  })
})
