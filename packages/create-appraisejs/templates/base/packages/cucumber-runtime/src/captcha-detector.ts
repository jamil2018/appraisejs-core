import type { Page } from 'playwright'

export const HUMAN_VERIFICATION_EVENT = 'appraise.runtime.blocked/v1' as const
export const HUMAN_VERIFICATION_REASON = 'human_verification_required' as const
export const CAPTCHA_DETECTOR_VERSION = 'captcha-structural/v1' as const

type CaptchaProvider = 'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare-challenge'
export type CaptchaCheckpoint = 'before_operation' | 'after_operation' | 'operation_error'

export type HumanVerificationRequiredEvent = {
  event: typeof HUMAN_VERIFICATION_EVENT
  data: {
    reason: typeof HUMAN_VERIFICATION_REASON
    detectorVersion: typeof CAPTCHA_DETECTOR_VERSION
    provider: CaptchaProvider
    pageOrigin: string
    frameOrigin: string
    signatureId: string
    checkpoint: CaptchaCheckpoint
    step: { id: string; version: string }
    operation: string
    observedAt: string
  }
}

export class HumanVerificationRequiredError extends Error {
  constructor(readonly terminalEvent: HumanVerificationRequiredEvent) {
    super('Human verification is required before managed automation can continue.')
    this.name = 'HumanVerificationRequiredError'
  }
}

type CaptchaDetection = Pick<
  HumanVerificationRequiredEvent['data'],
  'provider' | 'pageOrigin' | 'frameOrigin' | 'signatureId'
>

const CAPTCHA_DETECTION_SCRIPT = () => {
  type Provider = 'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare-challenge'
  type Detection = { provider: Provider; pageOrigin: string; frameOrigin: string; signatureId: string }
  const visible = (element: Element) => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    )
  }
  const iframeProvider = (iframe: HTMLIFrameElement): { provider: Provider; frameOrigin: string } | null => {
    let url: URL
    try {
      url = new URL(iframe.src, window.location.href)
    } catch {
      return null
    }
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()
    if ((host === 'www.google.com' || host === 'www.recaptcha.net') && path.startsWith('/recaptcha/'))
      return { provider: 'recaptcha', frameOrigin: url.origin }
    if ((host === 'hcaptcha.com' || host.endsWith('.hcaptcha.com')) && path.includes('captcha'))
      return { provider: 'hcaptcha', frameOrigin: url.origin }
    if (host === 'challenges.cloudflare.com' && path.includes('turnstile'))
      return { provider: 'turnstile', frameOrigin: url.origin }
    return null
  }
  const providerWidget = (): { provider: Provider; signatureId: string } | null => {
    const widgetSelectors: Array<[Provider, string]> = [
      ['recaptcha', '.g-recaptcha[data-sitekey], [data-recaptcha-widget-id][data-sitekey]'],
      ['hcaptcha', '.h-captcha[data-sitekey], [data-hcaptcha-widget-id][data-sitekey]'],
      ['turnstile', '.cf-turnstile[data-sitekey], [data-turnstile-widget-id][data-sitekey]'],
    ]
    for (const [provider, selector] of widgetSelectors) {
      const widget = document.querySelector(selector)
      if (widget && visible(widget)) return { provider, signatureId: `widget:${provider}` }
    }
    const cloudflareInterstitial = document.querySelector('#challenge-stage #challenge-form, #cf-challenge-running')
    return cloudflareInterstitial && visible(cloudflareInterstitial)
      ? { provider: 'cloudflare-challenge', signatureId: 'interstitial:cloudflare-challenge' }
      : null
  }
  const iframe = Array.from(document.querySelectorAll('iframe')).find(
    candidate => visible(candidate) && iframeProvider(candidate),
  )
  const frame = iframe ? iframeProvider(iframe) : null
  const widget = frame ? null : providerWidget()
  const detected = frame ?? widget
  return detected
    ? ({
        provider: detected.provider,
        pageOrigin: window.location.origin,
        frameOrigin: frame?.frameOrigin ?? window.location.origin,
        signatureId: frame ? `iframe:${frame.provider}` : widget!.signatureId,
      } satisfies Detection)
    : null
}

/** Only visible, allowlisted provider structures can stop a managed run.
 * Text, scripts, network activity, and hidden/offscreen DOM are deliberately
 * excluded to avoid attributing a target outcome from weak heuristics. */
export async function detectVisibleCaptchaChallenge(page: Page): Promise<CaptchaDetection | null> {
  try {
    const detection = await page.evaluate(CAPTCHA_DETECTION_SCRIPT)
    if (!detection || typeof detection.pageOrigin !== 'string' || typeof detection.frameOrigin !== 'string') return null
    if (!['recaptcha', 'hcaptcha', 'turnstile', 'cloudflare-challenge'].includes(detection.provider)) return null
    return detection as CaptchaDetection
  } catch {
    return null
  }
}

export async function assertNoHumanVerificationRequired(input: {
  page: Page
  checkpoint: CaptchaCheckpoint
  step: { id: string; version: string }
  operation: string
}) {
  const detection = await detectVisibleCaptchaChallenge(input.page)
  if (!detection) return
  throw new HumanVerificationRequiredError({
    event: HUMAN_VERIFICATION_EVENT,
    data: {
      reason: HUMAN_VERIFICATION_REASON,
      detectorVersion: CAPTCHA_DETECTOR_VERSION,
      provider: detection.provider,
      pageOrigin: detection.pageOrigin,
      frameOrigin: detection.frameOrigin,
      signatureId: detection.signatureId,
      checkpoint: input.checkpoint,
      step: input.step,
      operation: input.operation,
      observedAt: new Date().toISOString(),
    },
  })
}
