import { test, expect } from '@playwright/test'

import {
  disconnectPrisma,
  findModuleByName,
  generateSeededFeature,
  readGeneratedFeature,
  resetE2eData,
  seedCoreData,
  seededIds,
} from './helpers/test-data'
import { createEnvironment, createModule, createTag, expectPageHeading, saveForm } from './helpers/ui'

test.beforeEach(async () => {
  await resetE2eData()
  await seedCoreData()
})

test.afterAll(async () => {
  await disconnectPrisma()
})

test('dashboard and core navigation render seeded metrics and pages', async ({ page }) => {
  await page.goto('/')

  await expectPageHeading(page, 'Dashboard')
  await expect(page.getByText('Test Cases')).toBeVisible()
  await expect(page.getByText('Test Suites')).toBeVisible()
  await expect(page.getByText('Template Steps')).toBeVisible()
  await expect(page.getByText('Attention Needed')).toBeVisible()

  await page.getByRole('link', { name: /Dashboard/ }).click()
  await expectPageHeading(page, 'Dashboard')

  await page.goto('/modules')
  await expectPageHeading(page, 'Modules')
  await expect(page.getByText('E2E Auth', { exact: true }).first()).toBeVisible()

  await page.goto('/test-cases')
  await expectPageHeading(page, 'Test Cases')
  await expect(page.getByText('E2E seeded login works', { exact: true }).first()).toBeVisible()

  await page.goto('/test-suites')
  await expectPageHeading(page, 'Test Suites')
  await expect(page.getByText('E2E Auth Suite', { exact: true }).first()).toBeVisible()

  await page.goto('/settings')
  await expectPageHeading(page, 'Settings')
  await expect(page.getByRole('button', { name: 'Sync All' })).toBeVisible()
})

test('CRUD basics create records and edit/delete a representative module', async ({ page }) => {
  const moduleName = 'E2E UI Module'
  const editedModuleName = 'E2E UI Module Edited'

  await createModule(page, moduleName)
  await createEnvironment(page, 'E2E UI Environment')
  await createTag(page, 'E2E UI Tag', '@e2e-ui')

  await page.goto('/locator-groups')
  await expectPageHeading(page, 'Locator Groups')
  await expect(page.getByText('E2E Login Page', { exact: true }).first()).toBeVisible()

  await page.goto('/locators')
  await expectPageHeading(page, 'Locators')
  await expect(page.getByText('E2E Sign In Button', { exact: true }).first()).toBeVisible()

  await page.goto('/test-suites')
  await expectPageHeading(page, 'Test Suites')
  await expect(page.getByText('E2E Auth Suite', { exact: true }).first()).toBeVisible()

  const createdModule = await findModuleByName(moduleName)
  expect(createdModule).not.toBeNull()

  await page.goto(`/modules/modify/${createdModule?.id}`)
  await expect(page.getByLabel('Name')).toBeVisible()
  await page.getByLabel('Name').fill(editedModuleName)
  await saveForm(page)
  await expect(page).toHaveURL(/\/modules$/)
  await expect(page.getByText(editedModuleName, { exact: true }).first()).toBeVisible()

  await page.getByPlaceholder('Filter by name...').first().fill(editedModuleName)
  await page.getByRole('button', { name: 'Open menu' }).first().click()
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  await page.getByRole('button', { name: /^Delete$/ }).click()
  await page.reload()
  await page.getByPlaceholder('Filter by name...').first().fill(editedModuleName)
  await expect(page.getByText(editedModuleName, { exact: true }).first()).toBeHidden()
})

test('test authoring preview and saved seeded test case render template-backed step data', async ({ page }) => {
  await page.goto('/test-cases/create')
  await expectPageHeading(page, 'Create New Test Case')
  await expect(page.getByText('Test Case Details', { exact: true }).first()).toBeVisible()

  await page.goto('/test-cases')
  await expectPageHeading(page, 'Test Cases')
  await expect(page.getByText('E2E seeded login works', { exact: true }).first()).toBeVisible()

  await page.goto(`/test-cases/modify/${seededIds.testCase}`)
  await expectPageHeading(page, 'Modify Test Case')
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('E2E seeded login works')
  await page.getByRole('button', { name: /Continue/ }).click()
  await page.getByRole('button', { name: 'Show test scenario preview' }).click()
  await expect(page.getByText('Test Scenario(Preview)')).toBeVisible()
  await expect(page.getByText('Given I open the seeded page')).toBeVisible()
})

test('feature generation writes suite-backed feature output', async () => {
  const featurePath = await generateSeededFeature()
  const featureContent = readGeneratedFeature()

  expect(featurePath.replaceAll('\\', '/')).toContain('automation/features/E2E Auth/e2e-auth-suite.feature')
  expect(featureContent).toContain('Feature: Seeded suite for E2E feature generation')
  expect(featureContent).toContain('@e2e-smoke')
  expect(featureContent).toContain('Scenario: [E2E seeded login works] Seeded login smoke case')
  expect(featureContent).toContain('Given I open the seeded page')
})

test('test run details, logs, and report navigation render completed run data', async ({ page }) => {
  await page.goto(`/test-runs/${seededIds.testRun}`)

  await expectPageHeading(page, 'Test Run Details')
  await expect(page.getByText('E2E Completed Run')).toBeVisible()
  await expect(page.getByText('Finished', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('E2E seeded run started')).toBeVisible()

  await page.getByRole('link', { name: /View Report/ }).click()
  await expectPageHeading(page, /Test Run Report:/)
  await expect(page.getByText('E2E Completed Run')).toBeVisible()
  await expect(page.getByText('Total Tests')).toBeVisible()
  await expect(page.getByText('E2E seeded login works')).toBeVisible()
})

test('settings sync all completes without a fatal error', async ({ page }) => {
  await page.goto('/settings')
  await expectPageHeading(page, 'Settings')

  await page.getByRole('button', { name: 'Sync All' }).click()
  await expect(page.getByText(/Sync completed|Sync failed/).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/fatal|uncaught/i)).toHaveCount(0)
})
