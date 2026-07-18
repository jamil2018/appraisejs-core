// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { PlanObservabilityPanel } from './plan-observability-panel'

describe('PlanObservabilityPanel', () => {
  it('renders durable certification and bounded per-phase metrics', () => {
    const detail = {
      lifecycleCertification: {
        status: 'passed',
        matrixHash: 'sha256:matrix',
        durationMs: 1250,
        recordedAt: new Date('2026-07-18T10:00:00Z'),
      },
      efficiencyTelemetry: {
        retained: 4,
        phases: [
          {
            phase: 'validation',
            durationMs: 900,
            waitMs: 100,
            retries: 1,
            toolCalls: 4,
            responseBytes: 2048,
            recoveryCost: 20,
          },
        ],
      },
    } as unknown as PlanReviewDetail

    render(<PlanObservabilityPanel detail={detail} />)
    expect(screen.getByText('Certification passed')).toBeInTheDocument()
    expect(screen.getByText('sha256:matrix')).toBeInTheDocument()
    expect(screen.getByText('validation')).toBeInTheDocument()
    expect(screen.getByText(/4 calls · 1 retries/)).toBeInTheDocument()
    expect(screen.getByText(/4 locally retained/)).toBeInTheDocument()
  })
})
