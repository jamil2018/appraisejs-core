import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3200)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const databaseUrl = process.env.DATABASE_URL ?? `file:./e2e-${Date.now()}.db`
const seededTargetProjectId = '00000000-0000-4000-8000-000000000001'

process.env.DATABASE_URL = databaseUrl

export default defineConfig({
  testDir: './e2e',
  // Each spec resets and seeds the same SQLite database in beforeEach hooks.
  // Parallel workers or files would race on that shared DB (local and CI).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  grep: process.env.E2E_GREP ? new RegExp(process.env.E2E_GREP) : undefined,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    storageState: {
      cookies: [
        {
          name: 'appraise-active-project',
          value: seededTargetProjectId,
          domain: new URL(baseURL).hostname,
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          expires: -1,
        },
      ],
      origins: [],
    },
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
