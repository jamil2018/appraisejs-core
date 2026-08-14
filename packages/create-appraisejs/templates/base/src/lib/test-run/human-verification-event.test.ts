import { describe, expect, it } from 'vitest'

import { findHumanVerificationEvent, parseHumanVerificationEventLine } from './human-verification-event'

const terminalLine = JSON.stringify({
  event: 'appraise.runtime.blocked/v1',
  data: {
    reason: 'human_verification_required',
    detectorVersion: 'captcha-structural/v1',
    provider: 'recaptcha',
    pageOrigin: 'https://app.example.test',
    frameOrigin: 'https://www.google.com',
    signatureId: 'iframe:recaptcha',
    checkpoint: 'before_operation',
    step: { id: 'step.open', version: '1' },
    operation: 'browser.navigation.goto@1',
    observedAt: '2026-08-14T00:00:00.000Z',
    token: 'not-projected',
  },
})

describe('human verification terminal event parser', () => {
  it('accepts and sanitizes a complete structured event', () => {
    expect(parseHumanVerificationEventLine(`runtime ${terminalLine}`)).toEqual({
      reason: 'human_verification_required',
      detectorVersion: 'captcha-structural/v1',
      provider: 'recaptcha',
      pageOrigin: 'https://app.example.test',
      frameOrigin: 'https://www.google.com',
      signatureId: 'iframe:recaptcha',
      checkpoint: 'before_operation',
      step: { id: 'step.open', version: '1' },
      operation: 'browser.navigation.goto@1',
      observedAt: '2026-08-14T00:00:00.000Z',
    })
  })

  it.each([
    'human_verification_required',
    JSON.stringify({
      event: 'appraise.runtime.blocked/v1',
      data: { ...JSON.parse(terminalLine).data, observedAt: 'never' },
    }),
    JSON.stringify({
      event: 'appraise.runtime.blocked/v1',
      data: { ...JSON.parse(terminalLine).data, signatureId: '' },
    }),
  ])('rejects incomplete or text-only data', line => {
    expect(parseHumanVerificationEventLine(line)).toBeNull()
  })

  it('finds the first complete event in persisted log lines', () => {
    expect(findHumanVerificationEvent(`noise\n${terminalLine}\nmore noise`)).toMatchObject({ provider: 'recaptcha' })
  })
})
