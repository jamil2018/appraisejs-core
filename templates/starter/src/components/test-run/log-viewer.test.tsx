// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunStatus } from '@prisma/client'

import { LogViewer } from './log-viewer'

const { getTestRunLogsAction } = vi.hoisted(() => ({
  getTestRunLogsAction: vi.fn(),
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getTestRunLogsAction,
}))

vi.mock('./download-logs-button', () => ({
  DownloadLogsButton: ({ testRunId }: { testRunId: string }) => <div>Download logs for {testRunId}</div>,
}))

class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  readyState = MockEventSource.CONNECTING
  url: string
  closed = false
  listeners = new Map<string, Array<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existingListeners = this.listeners.get(type) ?? []
    existingListeners.push(listener)
    this.listeners.set(type, existingListeners)
  }

  close() {
    this.closed = true
    this.readyState = MockEventSource.CLOSED
  }

  emit(type: string, data?: unknown) {
    const event = { data: data === undefined ? '' : JSON.stringify(data) } as MessageEvent
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

describe('LogViewer', () => {
  beforeEach(() => {
    getTestRunLogsAction.mockReset()
  })

  it('loads persisted logs for completed test runs', async () => {
    getTestRunLogsAction.mockResolvedValue({
      status: 200,
      data: [
        {
          type: 'stdout',
          message: 'Run finished',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ],
    })

    render(<LogViewer testRunId="run-1" status={TestRunStatus.COMPLETED} />)

    expect(await screen.findByText('Run finished')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Download logs for run-1')).toBeInTheDocument()
  })

  it('renders duplicate log entries without dropping repeated messages', async () => {
    const duplicateTimestamp = '2026-05-30T09:22:19.484Z'
    const duplicateMessage = 'Scenario completed: [Demo Run With Template] Demo run using a template test case - unknown'
    getTestRunLogsAction.mockResolvedValue({
      status: 200,
      data: [
        {
          type: 'status',
          message: duplicateMessage,
          timestamp: duplicateTimestamp,
        },
        {
          type: 'status',
          message: duplicateMessage,
          timestamp: duplicateTimestamp,
        },
      ],
    })

    render(<LogViewer testRunId="run-duplicates" status={TestRunStatus.COMPLETED} />)

    expect(await screen.findAllByText(duplicateMessage)).toHaveLength(2)
  })

  it('streams live logs and dispatches the exit event when the run completes', async () => {
    const emittedEvents: Array<Event> = []
    const addEventListenerSpy = vi.spyOn(window, 'dispatchEvent')
    const eventSources: MockEventSource[] = []

    vi.stubGlobal(
      'EventSource',
      class extends MockEventSource {
        constructor(url: string) {
          super(url)
          eventSources.push(this)
        }
      },
    )

    render(<LogViewer testRunId="run-2" status={TestRunStatus.RUNNING} />)

    const eventSource = eventSources[0]
    expect(eventSource?.url).toBe('/api/test-runs/run-2/logs')

    eventSource.readyState = MockEventSource.OPEN
    eventSource.onopen?.(new Event('open'))
    eventSource.emit('log', { type: 'stdout', message: 'Scenario started' })
    eventSource.emit('exit', { code: 0 })

    await waitFor(() => {
      expect(screen.getByText('Scenario started')).toBeInTheDocument()
      expect(screen.getByText('Process exited with code 0')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    expect(addEventListenerSpy).toHaveBeenCalled()
    expect(eventSource.closed).toBe(true)

    addEventListenerSpy.mock.calls.forEach(call => emittedEvents.push(call[0]))
    const exitEvent = emittedEvents.find(event => event.type === 'testrun:exit') as CustomEvent | undefined
    expect(exitEvent?.detail).toEqual({ testRunId: 'run-2' })
  })
})
