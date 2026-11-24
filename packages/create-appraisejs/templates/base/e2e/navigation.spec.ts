import { test, expect } from '@playwright/test'

import { disconnectPrisma, resetE2eData, seedCoreData, seedEmptyProject, seededIds } from './helpers/test-data'
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
    { path: '/', heading: 'What would you like to check?' },
    { path: '/dashboard', heading: 'Dashboard' },
    { path: '/quality-journeys', heading: 'Quality Journeys' },
    { path: '/collaboration', heading: 'Repository collaboration' },
    { path: '/settings', heading: 'Settings' },
    { path: '/modules', heading: 'Modules' },
    { path: '/environments', heading: 'Environments' },
    { path: '/tags', heading: 'Tags' },
    { path: '/locator-groups', heading: 'Locator Groups' },
    { path: '/locators', heading: 'Locators' },
    { path: '/step-definitions', heading: 'Step Definitions' },
    { path: '/template-test-cases', heading: 'Case Templates' },
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
    { path: '/template-test-cases/create', heading: 'Create Case Template' },
    { path: '/test-suites/create', heading: 'Create Test Suite' },
    { path: '/test-cases/create', heading: 'Create New Test Case' },
    { path: '/test-cases/create-from-template', heading: 'Create Test Case From Template' },
    { path: '/test-runs/create', heading: 'Create Test Run' },
  ]

  test('primary list and create routes render expected headings', async ({ page }) => {
    await visitRoutes(page, [...listRoutes, ...createRoutes])
  })

  test('home opens the project brief and Workspace opens the metrics dashboard', async ({ page }) => {
    await page.goto(`/?project=${seededIds.targetProject}`)
    await expectPageHeading(page, 'What would you like to check?')
    await expect(page).toHaveURL(/\/quality-journeys\/new\?project=/)

    const areas = page.getByRole('navigation', { name: 'App sections' })
    await expect(areas.getByRole('link', { name: 'Chats' })).toHaveAttribute('aria-current', 'true')
    const search = page.getByRole('button', { name: 'Search recent Journeys' })
    await search.click()
    const input = page.getByRole('searchbox', { name: 'Filter recent Journeys' })
    await expect(input).toBeFocused()
    await input.fill('missing brief')
    await expect(page.getByText('No recent Journeys found.')).toBeVisible()
    await input.press('Escape')
    await expect(search).toBeFocused()

    await areas.getByRole('link', { name: 'Workspace' }).click()
    await expectPageHeading(page, 'Dashboard')
    await expect(areas.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('link', { name: 'Test Cases', exact: true })).toBeVisible()
  })

  test('test cases keep creation, search, and selection actions together', async ({ page }) => {
    await page.goto('/test-cases')

    const create = page.getByRole('button', { name: 'New test case', exact: true })
    await expect(create).toHaveCount(1)
    await create.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'From scratch' })).toHaveAttribute('href', '/test-cases/create')
    await expect(page.getByRole('menuitem', { name: 'From template' })).toHaveAttribute(
      'href',
      '/test-cases/create-from-template',
    )
    await page.keyboard.press('Escape')
    await expect(create).toBeFocused()

    const search = page.getByRole('textbox', { name: 'Search test cases' })
    const region = page.getByRole('region', { name: 'Test cases' })
    const description = region.getByRole('columnheader', { name: 'Description' })
    await expect(description).toBeHidden()
    await page.getByRole('button', { name: 'Columns', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: 'description' }).click()
    await expect(description).toBeVisible()
    await page.keyboard.press('Escape')
    await search.fill('missing')
    await expect(region.getByText('No results.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')

    const remove = page.getByRole('button', { name: 'Delete selected item(s)' })
    await expect(remove).toBeHidden()
    await region.getByRole('checkbox', { name: 'Select E2E seeded login works' }).check()
    await expect(remove).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit selected item' })).toHaveAttribute(
      'href',
      `/test-cases/modify/${seededIds.testCase}`,
    )
  })

  test('a case opens a scoped Journey brief and returning restores the collection view', async ({ page }) => {
    await page.goto('/test-cases')
    const search = page.getByRole('textbox', { name: 'Search test cases' })
    const rowName = 'E2E seeded login works'
    const selection = page.getByRole('checkbox', { name: `Select ${rowName}` })
    await search.fill('seeded login')
    await selection.check()
    await page.getByRole('button', { name: `Actions for ${rowName}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Use in a Journey' }).click()
    await expectPageHeading(page, 'What would you like to check?')
    await expect(page).toHaveURL(/quality-journeys\/new\?.*record=e2e-test-case/)
    await expect(page.locator('form').getByText(rowName, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start journey' })).toBeDisabled()

    await page.goBack()
    await expect(search).toHaveValue('seeded login')
    await expect(selection).toBeChecked()
  })

  test('the desktop rail can collapse and reopen the project context pane', async ({ page }) => {
    await page.goto('/quality-journeys/new')
    await expectPageHeading(page, 'What would you like to check?')
    const rail = page.getByRole('navigation', { name: 'App sections' })
    const context = page.getByRole('navigation', { name: 'Recent Journeys by project' })
    await expect(context).toBeVisible()
    await rail.getByRole('button', { name: 'Collapse sidebar' }).press('Enter')
    await expect(context).toBeHidden()
    await expect(rail.getByRole('link', { name: 'Integrations' })).toBeVisible()
    const expand = rail.getByRole('button', { name: 'Expand sidebar' })
    await expect(expand).toBeFocused()
    const command = rail.getByRole('button', { name: 'Open Command Palette' })
    const palette = page.getByRole('dialog', { name: 'Command Palette' })
    await command.click()
    await expect(palette).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    await expect(command).toBeFocused()
    await expand.press('Enter')
    await expect(context).toBeVisible()
  })

  test('appearance follows the saved theme across routes and reloads', async ({ page }) => {
    await page.goto('/settings')
    const root = page.locator('html')
    await expect(root).toHaveClass(/\bdark\b/)
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(root).toHaveClass(/\blight\b/)
    await page.goto('/test-cases')
    await expect(root).toHaveClass(/\blight\b/)
    await expectPageHeading(page, 'Test Cases')
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(root).toHaveClass(/\bdark\b/)
  })

  test('workspace screens fill wide displays and contain overflow on narrow screens', async ({ page }) => {
    const screens = [
      { path: '/dashboard', heading: 'Dashboard' },
      { path: '/test-cases', heading: 'Test Cases' },
      { path: '/test-suites/create', heading: 'Create Test Suite' },
      { path: '/environments/create', heading: 'Create Environment' },
      { path: `/reports/${seededIds.report}`, heading: /Test Run Report:/ },
      { path: '/projects', heading: 'Projects' },
      { path: '/settings', heading: 'Settings' },
      { path: '/help', heading: 'Help' },
    ]
    await page.setViewportSize({ width: 1920, height: 1000 })
    for (const { path, heading } of screens) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: typeof heading === 'string' })).toBeVisible()
      const space = await page
        .locator('#main-content > div')
        .first()
        .evaluate(element => {
          const shell = element.parentElement!
          const style = getComputedStyle(shell)
          return {
            available: shell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
            used: element.getBoundingClientRect().width,
          }
        })
      expect(space.used, path).toBeCloseTo(space.available, 0)
      await page.setViewportSize({ width: 320, height: 740 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: path })
        .toBe(true)
      if (path === '/test-cases') {
        const columns = page.getByRole('button', { name: 'Columns', exact: true })
        await columns.click()
        await expect(page.getByRole('menuitemcheckbox', { name: 'title', exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(columns).toBeFocused()
      }
      await page.setViewportSize({ width: 1920, height: 1000 })
    }
  })

  test('command palette dismisses back to its trigger in desktop and mobile navigation', async ({ page }) => {
    await page.goto('/')
    const command = page.getByRole('dialog', { name: 'Command Palette' })
    const commandInput = command.getByRole('combobox')
    const desktopSearch = page.getByRole('button', { name: 'Open Command Palette' })

    await page.getByRole('combobox', { name: 'Active project' }).focus()
    await page.keyboard.press('Tab')
    await expect(desktopSearch).toBeFocused()
    await expect(desktopSearch).toHaveCSS('outline-style', 'solid')
    await expect(desktopSearch).toHaveCSS('outline-width', '2px')
    await desktopSearch.press('ControlOrMeta+k')
    await expect(commandInput).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(command).toBeHidden()
    await expect(desktopSearch).toBeFocused()

    await page.setViewportSize({ width: 390, height: 844 })
    const navigationButton = page.getByRole('button', { name: 'Open navigation menu' })
    const navigation = page.getByRole('dialog', { name: 'Navigation menu' })
    await navigationButton.click()
    const mobileSearch = navigation.getByRole('button', { name: 'Open Command Palette' })
    await mobileSearch.focus()
    await mobileSearch.press('ControlOrMeta+k')
    await expect(command).toHaveCount(1)
    await expect(commandInput).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(command).toBeHidden()
    await expect(navigation).toBeVisible()
    await expect(mobileSearch).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(navigation).toBeHidden()
    await expect(navigationButton).toBeFocused()
  })

  test('removed Quality Plan, Assessment, and compatibility routes return ordinary not-found pages', async ({
    page,
  }) => {
    for (const path of ['/quality-plans', '/assessments', '/quality-journeys/compatibility']) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
    }
  })

  test('test case picker keeps its actions visible when the list scrolls on a short screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 })
    await page.goto('/test-suites/create')
    const browse = page.getByRole('button', { name: /Select test case\(s\) Browse/i })
    await browse.click()

    const picker = page.getByRole('dialog', { name: 'Select Test Cases' })
    await expect(picker.getByRole('region', { name: 'Available test cases' })).toBeVisible()
    const loginCase = picker.getByRole('checkbox', { name: 'Select E2E seeded login works', exact: true })
    await loginCase.press('Space')
    await expect(loginCase).toBeChecked()
    await expect(picker.getByRole('checkbox', { name: 'Select E2E secondary case', exact: true })).not.toBeChecked()
    await expect(picker.getByRole('button', { name: 'Save' })).toBeInViewport()
    const pageSize = picker.getByRole('combobox', { name: 'Rows per page' })
    await pageSize.scrollIntoViewIfNeeded()
    await expect(pageSize).toBeInViewport()
    await expect(picker.getByRole('button', { name: 'Cancel' })).toBeInViewport()
    await expect(picker.getByRole('button', { name: 'Save' })).toBeInViewport()

    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
    await expect(browse).toBeFocused()
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
        heading: 'Modify Case Template',
      },
      { path: buildModifyPath('/test-cases', seededIds.testCase), heading: 'Modify Test Case' },
      { path: buildModifyPath('/test-suites', seededIds.testSuite), heading: 'Name' },
      { path: `/test-runs/${seededIds.testRun}`, heading: 'Test Run Details' },
      { path: `/reports/${seededIds.report}`, heading: /Test Run Report:/ },
    ]

    await visitRoutes(page, detailRoutes)
  })

  test('dashboard attention needed links navigate to filtered report pages', async ({ page }) => {
    await page.goto('/dashboard')
    await expectPageHeading(page, 'Dashboard')

    await page.getByRole('button', { name: 'Failed Runs' }).click()
    await expect(page).toHaveURL(/\/test-runs\?filter=recentFailed/)
    await expectPageHeading(page, 'Test Runs')
    await expect(page.getByText('E2E Failed Run', { exact: true }).first()).toBeVisible()

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Failing Tests' }).click()
    await expect(page).toHaveURL(/\/reports\/test-cases\?filter=repeatedlyFailing/)
    await expectPageHeading(page, 'Failing Test Cases Report')

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Flaky Tests' }).click()
    await expect(page).toHaveURL(/\/reports\/test-cases\?filter=flaky/)
    await expectPageHeading(page, 'Failing Test Cases Report')

    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'Unexecuted Suites' }).click()
    await expect(page).toHaveURL(/\/reports\/test-suites\?filter=notExecutedRecently/)
    await expectPageHeading(page, 'Test Suites Report')
  })

  test('client navigation remounts route content while preserving navigation', async ({ page }) => {
    await page.goto('/dashboard')
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

test('empty libraries keep their heading and next action together on a narrow screen', async ({ page }) => {
  await resetE2eData()
  await seedEmptyProject()
  await page.setViewportSize({ width: 320, height: 740 })

  await page.goto('/test-cases')
  await expect(page.getByRole('heading', { name: 'Test Cases', level: 1 })).toBeInViewport()
  await expect(page.getByRole('heading', { name: 'No test cases yet' })).toBeInViewport()
  const create = page.getByRole('button', { name: 'New test case' })
  await expect(create).toBeInViewport()
  await create.click()
  await expect(page.getByRole('menuitem', { name: 'From template' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  for (const [path, title, action] of [
    ['/test-runs', 'Test Runs', 'Create Test Run'],
    ['/reports', 'Reports', 'Start a Quality Journey'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeInViewport()
    await expect(page.getByRole('link', { name: action, exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
