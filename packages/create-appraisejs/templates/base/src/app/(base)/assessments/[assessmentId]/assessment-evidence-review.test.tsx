// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AssessmentEvidenceReview } from './assessment-evidence-review'

describe('AssessmentEvidenceReview', () => {
  it('shows sealed evidence, design limitations, and a linked baseline summary', () => {
    render(
      <AssessmentEvidenceReview
        baseline={{
          assessmentId: 'assessment-baseline',
          status: 'DECIDED',
          evidenceReceiptCount: 2,
          decision: 'ACCEPTED',
        }}
        evidenceReceipts={[
          {
            id: 'receipt-1',
            validationVersionId: 'validation-1',
            resultMatrixCell: 'CHROMIUM:environment-1',
            assuranceLevel: 'STANDARD',
            outcome: 'PASSED',
            runtimeInputHash: 'sha256:runtime',
            environmentSnapshotHash: 'sha256:environment',
            browserSnapshotHash: null,
            dataProvenanceHash: 'sha256:data',
            outputHash: 'sha256:output',
            reportHash: 'sha256:report',
            logHash: 'sha256:log',
            traceHash: null,
            receiptHash: 'sha256:receipt',
            sealedAt: null,
          },
        ]}
        runtimeCells={[
          { validationVersionId: 'validation-1', resultMatrixCell: 'CHROMIUM:environment-1' },
          { validationVersionId: 'validation-1', resultMatrixCell: 'FIREFOX:environment-1' },
        ]}
        validationVersions={[
          {
            id: 'validation-1',
            validationIdentity: 'receipt-validation',
            status: 'PUBLISHED',
            design: { limitations: ['No payment-provider failure path'] },
          },
        ]}
      />,
    )

    expect(screen.getByText('CHROMIUM:environment-1')).toBeInTheDocument()
    expect(screen.getByText('FIREFOX:environment-1')).toBeInTheDocument()
    expect(screen.getByText('No payment-provider failure path')).toBeInTheDocument()
    expect(screen.getByText(/Baseline assessment-baseline is decided/)).toBeInTheDocument()
  })
})
