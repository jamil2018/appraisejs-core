import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3200)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const databaseUrl = process.env.DATABASE_URL ?? `file:./e2e-${Date.now()}.db`

process.env.DATABASE_URL = databaseUrl

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: process.env.CI ? 4 : 1,
  timeout: 60_000,
  grep: process.env.E2E_GREP ? new RegExp(process.env.E2E_GREP) : undefined,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node e2e/start-server.mjs ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ENVIRONMENT: 'local',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
