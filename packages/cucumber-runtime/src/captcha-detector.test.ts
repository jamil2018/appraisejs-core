import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

import { CAPTCHA_DETECTOR_VERSION, detectVisibleCaptchaChallenge } from './captcha-detector.ts'

describe('visible CAPTCHA detector', () => {
  let browser: Browser | undefined
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('detects a visible allowlisted provider iframe without reading challenge contents', async () => {
    await page.setContent(
      '<iframe title="challenge" src="https://www.google.com/recaptcha/api2/anchor?k=public" style="width: 302px; height: 78px"></iframe>',
    )
    await expect(detectVisibleCaptchaChallenge(page)).resolves.toMatchObject({ provider: 'recaptcha' })
  })

  it.each([
    ['text only', '<p>Please verify you are human</p>'],
    [
      'hidden provider widget',
      '<div class="g-recaptcha" data-sitekey="public" style="display: none; width: 302px; height: 78px"></div>',
    ],
    [
      'offscreen provider iframe',
      '<iframe src="https://hcaptcha.com/captcha/v1/abc" style="position:absolute; left:-10000px; width: 302px; height: 78px"></iframe>',
    ],
    ['provider script only', '<script src="https://www.google.com/recaptcha/api.js"></script>'],
  ])('does not block %s', async (_name, fixture) => {
    await page.setContent(fixture)
    await expect(detectVisibleCaptchaChallenge(page)).resolves.toBeNull()
  })

  it('keeps detector identity versioned', () => {
    expect(CAPTCHA_DETECTOR_VERSION).toBe('captcha-structural/v1')
  })
})
