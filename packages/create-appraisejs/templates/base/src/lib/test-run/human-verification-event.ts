const HUMAN_VERIFICATION_EVENT = 'appraise.runtime.blocked/v1' as const
const HUMAN_VERIFICATION_REASON = 'human_verification_required' as const
const CAPTCHA_DETECTOR_VERSION = 'captcha-structural/v1' as const

const PROVIDERS = ['recaptcha', 'hcaptcha', 'turnstile', 'cloudflare-challenge'] as const
const CHECKPOINTS = ['before_operation', 'after_operation', 'operation_error'] as const

export type HumanVerificationEvent = {
  reason: typeof HUMAN_VERIFICATION_REASON
  detectorVersion: typeof CAPTCHA_DETECTOR_VERSION
  provider: (typeof PROVIDERS)[number]
  pageOrigin: string
  frameOrigin: string
  signatureId: string
  checkpoint: (typeof CHECKPOINTS)[number]
  step: { id: string; version: string }
  operation: string
  observedAt: string
}

export type RuntimeEvent = { event: string; data: Record<string, unknown> }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function originValue(value: unknown): string | null {
  const origin = stringValue(value)
  if (!origin) return null
  try {
    return new URL(origin).origin === origin ? origin : null
  } catch {
    return null
  }
}

function observedAtValue(value: unknown): string | null {
  const observedAt = stringValue(value)
  return observedAt && Number.isFinite(Date.parse(observedAt)) ? observedAt : null
}

function signatureIdValue(value: unknown): string | null {
  const signatureId = stringValue(value)
  return signatureId && /^[a-z0-9][a-z0-9:_-]{0,127}$/i.test(signatureId) ? signatureId : null
}

function memberOf<T extends readonly string[]>(values: T, value: unknown): T[number] | null {
  return typeof value === 'string' && values.includes(value) ? (value as T[number]) : null
}

export function parseRuntimeEventLine(line: string): RuntimeEvent | null {
  const eventJson = line.match(/\{[\s\S]*"event"[\s\S]*\}/)?.[0]
  if (!eventJson) return null

  try {
    const parsed = record(JSON.parse(eventJson))
    const event = stringValue(parsed?.event)
    const data = record(parsed?.data)
    return event && data ? { event, data } : null
  } catch {
    return null
  }
}

function humanVerificationFacts(data: Record<string, unknown>) {
  const provider = memberOf(PROVIDERS, data.provider)
  const checkpoint = memberOf(CHECKPOINTS, data.checkpoint)
  const pageOrigin = originValue(data.pageOrigin)
  const frameOrigin = originValue(data.frameOrigin)
  const signatureId = signatureIdValue(data.signatureId)
  const operation = stringValue(data.operation)
  const observedAt = observedAtValue(data.observedAt)
  if (!provider || !checkpoint || !pageOrigin || !frameOrigin || !signatureId || !operation || !observedAt) return null
  return { provider, checkpoint, pageOrigin, frameOrigin, signatureId, operation, observedAt }
}

function humanVerificationStep(data: Record<string, unknown>) {
  const step = record(data.step)
  const stepId = stringValue(step?.id)
  const stepVersion = stringValue(step?.version)
  return stepId && stepVersion ? { id: stepId, version: stepVersion } : null
}

function humanVerificationData(data: Record<string, unknown>): HumanVerificationEvent | null {
  if (data.reason !== HUMAN_VERIFICATION_REASON || data.detectorVersion !== CAPTCHA_DETECTOR_VERSION) return null
  const facts = humanVerificationFacts(data)
  const step = humanVerificationStep(data)
  return facts && step
    ? { reason: HUMAN_VERIFICATION_REASON, detectorVersion: CAPTCHA_DETECTOR_VERSION, ...facts, step }
    : null
}

export function parseHumanVerificationEventLine(line: string): HumanVerificationEvent | null {
  const event = parseRuntimeEventLine(line)
  return event?.event === HUMAN_VERIFICATION_EVENT ? humanVerificationData(event.data) : null
}

export function findHumanVerificationEvent(logs: string | null | undefined): HumanVerificationEvent | null {
  if (!logs) return null
  return logs.split(/\r?\n/).map(parseHumanVerificationEventLine).find(Boolean) ?? null
}
