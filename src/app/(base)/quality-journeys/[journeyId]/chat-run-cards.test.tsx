// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatRunActivityCard } from './chat-run-activity-card'
import { ChatRunPermissionCard } from './chat-run-permission-card'

const projectId = 'checkout-project'
const journeyId = 'qjy_checkout'

describe('saved chat run cards', () => {
  it('shows the bound environment, effect and immutable test scope before consent', () => {
    render(
      <ChatRunPermissionCard
        projectId={projectId}
        journeyId={journeyId}
        permission={{
          id: 'qjec_checkout',
          status: 'REQUESTED',
          reason: 'Run the approved guest checkout checks.',
          scopeHash: 'sha256:reviewed-scope',
          grantedAt: null,
          expiresAt: null,
          usedAt: null,
          revokedAt: null,
          executionCycleId: null,
          stale: false,
          expired: false,
          target: 'Checkout project',
          environment: { name: 'Staging', baseUrl: 'https://checkout.example.test', browserEngine: 'CHROMIUM' },
          scenarios: [
            {
              preparedRuntimeCapsuleId: 'capsule-checkout',
              scenarioRevisionId: 'scenario-checkout',
              title: 'Guest buys one item',
            },
            {
              preparedRuntimeCapsuleId: 'capsule-confirmation',
              scenarioRevisionId: 'scenario-confirmation',
              title: 'Confirmation shows order number',
            },
          ],
          scope: {
            schemaVersion: 'appraise.quality-journey/v1',
            checkpoint: 'START_EXECUTION:staging:CHROMIUM',
            targetProjectId: projectId,
            targetFingerprint: 'checkout-target',
            environmentSnapshotHash: `sha256:${'a'.repeat(64)}`,
            preparedRuntimeCapsuleIds: ['capsule-checkout', 'capsule-confirmation'],
            actions: ['BROWSER_INTERACTION'],
            executionInputsHash: 'sha256:reviewed-inputs',
            resourceHashes: {},
          },
        }}
      />,
    )

    const card = screen.getByRole('article', { name: 'Run permission' })
    expect(within(card).getByText('Checkout project')).toBeVisible()
    expect(within(card).getByText('Staging')).toBeVisible()
    expect(within(card).getByText('https://checkout.example.test')).toBeVisible()
    expect(within(card).getByText('Chromium')).toBeVisible()
    expect(within(card).getByText('Browser interaction')).toBeVisible()
    expect(within(card).getByRole('list', { name: 'Approved tests' })).toHaveTextContent('Guest buys one item')
    expect(within(card).getByRole('list', { name: 'Approved tests' })).toHaveTextContent(
      'Confirmation shows order number',
    )
    fireEvent.click(within(card).getByText('Exact reviewed scope'))
    expect(within(card).getByText('capsule-checkout, capsule-confirmation')).toBeVisible()
    expect(within(card).getByText('sha256:reviewed-scope')).toBeVisible()
    expect(within(card).getByRole('link', { name: 'Review run details' })).toHaveAttribute(
      'href',
      '/quality-journeys/qjy_checkout?project=checkout-project#execution',
    )
  })

  it('shows the recorded attempt and warns when ownership is unknown', () => {
    render(
      <ChatRunActivityCard
        projectId={projectId}
        journeyId={journeyId}
        cycle={{
          id: 'cycle-checkout',
          status: 'RUNNING',
          environmentId: 'staging',
          browserEngine: 'CHROMIUM',
          testRuns: [
            {
              testRunId: 'run-checkout',
              runId: 'process-checkout',
              status: 'RUNNING',
              bindingStatus: 'RUNNING',
              result: 'PENDING',
              scenarioRevisionId: 'scenario-checkout',
              diagnostic: { code: 'OWNERSHIP_LOST', duplicateLaunchPrevented: true },
            },
          ],
          evidence: [],
        }}
      />,
    )

    const card = screen.getByRole('article', { name: 'Activity' })
    expect(within(card).getAllByText('Running')).toHaveLength(2)
    expect(within(card).getByRole('alert')).toHaveTextContent('cannot confirm whether the original run is still active')
    expect(within(card).getByRole('link', { name: 'View test run' })).toHaveAttribute(
      'href',
      '/test-runs/run-checkout?project=checkout-project',
    )
  })
})
