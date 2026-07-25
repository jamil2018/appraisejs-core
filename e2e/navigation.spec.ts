import { test, expect } from '@playwright/test'

import { disconnectPrisma, resetE2eData, seedCoreData, seededIds } from './helpers/test-data'
import { buildModifyPath, visitRoutes, type RouteExpectation } from './helpers/navigation'
import { expectPageHeading } from './helpers/ui'

test.describe('Navigation @navigation', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  const listRoutes: RouteExpectation[] = [
    { path: '/', heading: 'Dashboard' },
    { path: '/settings', heading: 'Settings' },
    { path: '/modules', heading: 'Modules' },
    { path: '/environments', heading: 'Environments' },
    { path: '/tags', heading: 'Tags' },
    { path: '/locator-groups', heading: 'Locator Groups' },
    { path: '/locators', heading: 'Locators' },
    { path: '/template-test-cases', heading: 'Template Test Cases' },
    { path: '/test-suites', heading: 'Test Suites' },
    { path: '/test-cases', heading: 'Test Cases' },
    { path: '/test-runs', heading: 'Test Runs' },
    { path: '/reports', heading: 'Reports' },
    { path: '/reports/test-cases', heading: 'Failing Test Cases Report' },
    { path: '/reports/test-suites', heading: 'Test Suites Report' },
  ]

  const createRoutes: RouteExpectation[] = [
    { path: '/modules/create', heading: 'Create Module' },
    { path: '/environments/create', heading: 'Create Environment' },
    { path: '/tags/create', heading: 'Create Tag' },
    { path: '/locator-groups/create', heading: 'Create Locator Group' },
    { path: '/locators/create', heading: 'Create Locator' },
    { path: '/step-definitions/create', heading: 'Create reusable step' },
    { path: '/template-test-cases/create', heading: 'Create Template Test Case' },
    { path: '/test-suites/create', heading: 'Create Test Suite' },
    { path: '/test-cases/create', heading: 'Create New Test Case' },
    { path: '/test-cases/create-from-template', heading: 'Create Test Case From Template' },
    { path: '/test-runs/create', heading: 'Create Test Run' },
  ]

  test('primary list and create routes render expected headings', async ({ page }) => {
    await visitRoutes(page, [...listRoutes, ...createRoutes])
  })

  test('modify and detail routes render for seeded records', async ({ page }) => {
    const detailRoutes: RouteExpectation[] = [
      { path: buildModifyPath('/modules', seededIds.module), heading: 'Name' },
      { path: buildModifyPath('/environments', seededIds.environment), heading: 'Modify Environment' },
      { path: buildModifyPath('/tags', seededIds.tag), heading: 'Modify Tag' },
      { path: buildModifyPath('/locator-groups', seededIds.locatorGroup), heading: 'Name' },
      { path: buildModifyPath('/locators', seededIds.locator), heading: 'Update Locator' },
      {
        path: buildModifyPath('/template-test-cases', seededIds.templateTestCase),
        heading: 'Modify Template Test Case',
      },
      { path: buildModifyPath('/test-cases', seededIds.testCase), heading: 'Modify Test Case' },
      { path: buildModifyPath('/test-suites', seededIds.testSuite), heading: 'Name' },
      { path: `/test-runs/${seededIds.testRun}`, heading: 'Test Run Details' },
      { path: `/reports/${seededIds.report}`, heading: /Test Run Report:/ },
    ]

    await visitRoutes(page, detailRoutes)
  })

  test('dashboard attention needed links navigate to filtered report pages', async ({ page }) => {
    await page.goto('/')
    await expectPageHeading(page, 'Dashboard')

    await page.getByRole('button', { name: 'Failed Runs' }).click()
    await expect(page).toHaveURL(/\/test-runs\?filter=recentFailed/)
    await expectPageHeading(page, 'Test Runs')
    await expect(page.getByText('E2E Failed Run', { exact: true }).first()).toBeVisible()

    await page.goto('/')
    await page.getByRole('button', { name: 'Failing Tests' }).click()
    await expect(page).toHaveURL(/\/reports\/test-cases\?filter=repeatedlyFailing/)
    await expectPageHeading(page, 'Failing Test Cases Report')

    await page.goto('/')
    await page.getByRole('button', { name: 'Flaky Tests' }).click()
    await expect(page).toHaveURL(/\/reports\/test-cases\?filter=flaky/)
    await expectPageHeading(page, 'Failing Test Cases Report')

    await page.goto('/')
    await page.getByRole('button', { name: 'Unexecuted Suites' }).click()
    await expect(page).toHaveURL(/\/reports\/test-suites\?filter=notExecutedRecently/)
    await expectPageHeading(page, 'Test Suites Report')
  })

  test('client navigation remounts route content while preserving navigation', async ({ page }) => {
    await page.goto('/')
    await expectPageHeading(page, 'Dashboard')
    await expect(page.locator('[data-page-transition]')).toHaveAttribute('data-page-transition-variant', 'fade')

    const initialTransition = await page.locator('[data-page-transition]').evaluate(element => {
      element.setAttribute('data-transition-instance', 'initial')
      return element.getAttribute('data-transition-instance')
    })
    const navigation = page.locator('[data-persistent-navigation]')
    await navigation.evaluate(element => element.setAttribute('data-navigation-instance', 'persistent'))

    expect(initialTransition).toBe('initial')
    await page.getByRole('link', { name: 'Settings' }).click()

    await expectPageHeading(page, 'Settings')
    await expect(page.locator('[data-page-transition]')).not.toHaveAttribute('data-transition-instance', 'initial')
    await expect(page.locator('[data-page-transition]')).toHaveAttribute('data-page-transition-variant', 'fade')
    await expect(navigation).toHaveAttribute('data-navigation-instance', 'persistent')
  })

  test('creation and modification routes use slide transitions', async ({ page }) => {
    await page.goto('/modules/create')
    await expectPageHeading(page, 'Create Module')
    await expect(page.locator('[data-page-transition]')).toHaveAttribute('data-page-transition-variant', 'slide')

    await page.goto(buildModifyPath('/modules', seededIds.module))
    await expectPageHeading(page, 'Name')
    await expect(page.locator('[data-page-transition]')).toHaveAttribute('data-page-transition-variant', 'slide')
  })

  test('reduced motion navigation completes without an active entrance animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    await page.getByRole('link', { name: 'Settings' }).click()
    await expectPageHeading(page, 'Settings')

    const transition = page.locator('[data-page-transition]')
    await expect(transition).toHaveCSS('opacity', '1')
    await expect(transition).toHaveCSS('transform', 'none')
  })
})
