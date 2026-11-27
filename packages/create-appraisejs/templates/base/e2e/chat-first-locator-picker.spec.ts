import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

let targetServer: Server
let targetUrl: string

const targetMarkup = `<!doctype html>
<html><head><title>Checkout fixture</title></head><body>
  <main><h1>Checkout fixture</h1><button id="place-order" data-testid="place-order" type="button">Place order</button></main>
  <script>
    if (new URL(location.href).searchParams.get('autopick') === '1') {
      let started = false;
      const timer = setInterval(() => {
        if (started) return;
        const root = document.getElementById('appraise-locator-picker-root');
        const start = [...(root?.querySelectorAll('button') || [])].find(button => button.textContent === 'Start picking');
        if (!start) return;
        started = true;
        clearInterval(timer);
        start.click();
        document.getElementById('place-order').click();
        setTimeout(() => {
          const use = [...root.querySelectorAll('button')].find(button => button.textContent === 'Use selector');
          use?.click();
        }, 100);
      }, 50);
    }
  </script>
</body></html>`

test.describe('Chat-first locator picker', () => {
  test.beforeAll(async () => {
    targetServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(targetMarkup)
    })
    await new Promise<void>((resolve, reject) => {
      targetServer.once('error', reject)
      targetServer.listen(0, '127.0.0.1', resolve)
    })
    targetUrl = `http://127.0.0.1:${(targetServer.address() as AddressInfo).port}/checkout`
  })

  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })

  test.afterEach(async ({ page }) => {
    const cancel = page.getByRole('button', { name: 'Cancel picker' })
    if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => undefined)
  })

  test.afterAll(async () => {
    await new Promise<void>(resolve => targetServer.close(() => resolve()))
    await disconnectPrisma()
  })

  async function launch(page: import('@playwright/test').Page, autopick: boolean) {
    await page.goto(`/locators/create?project=${seededIds.targetProject}`)
    await page.getByRole('radio', { name: 'Direct URL' }).click()
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill(`${targetUrl}?autopick=${autopick ? '1' : '0'}`)
    await page.getByRole('button', { name: 'Launch Chromium' }).click()
  }

  test('captures one live local target into the editor and saves the observed selector', async ({ page }) => {
    await launch(page, true)
    await expect(page.getByText('Picked from page')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Verified as one live match/)).toBeVisible()
    await expect(page.getByLabel('Selector')).toHaveValue('css=[data-testid="place-order"]')

    await page.getByLabel('Locator Name').fill('Place order')
    await page.getByRole('radio', { name: 'Use existing group' }).click()
    await page.getByRole('combobox', { name: 'Locator Group' }).click()
    await page.getByRole('option', { name: 'E2E Login Page' }).click()
    await page.getByRole('button', { name: 'Save Locator' }).click()
    await expect(page).toHaveURL(`/locators?project=${seededIds.targetProject}`)

    const saved = await prisma.locator.findFirstOrThrow({
      where: { targetProjectId: seededIds.targetProject, name: 'Place order' },
    })
    expect(saved).toMatchObject({
      value: 'css=[data-testid="place-order"]',
      locatorGroupId: seededIds.locatorGroup,
    })
  })

  test('cancels an unpicked local session without saving a locator', async ({ page }) => {
    const before = await prisma.locator.count({ where: { targetProjectId: seededIds.targetProject } })
    await launch(page, false)
    await expect(page.getByRole('button', { name: 'Cancel picker' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Cancel picker' }).click()
    await expect(page.getByText('No target picked')).toBeVisible()
    expect(await prisma.locator.count({ where: { targetProjectId: seededIds.targetProject } })).toBe(before)
  })
})
