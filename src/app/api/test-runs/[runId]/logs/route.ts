import { NextRequest } from 'next/server'
import { processManager } from '@/lib/test-run/process-manager'
import { taskSpawner } from '@/lib/process/task-spawner'
import prisma from '@/config/db-config'
import { TestRunStatus } from '@prisma/client'
import { getTestRunLogsService } from '@/services/test-run/test-run-service'
import type { LogEntry } from '@/lib/test-run/log-formatter'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project'
import { ServiceError } from '@/services/shared/errors'

// Ensure this route runs in Node.js runtime (not Edge) for singleton to work
export const runtime = 'nodejs'

type LogMode = 'full' | 'summary' | 'errorsOnly' | 'tail' | 'aroundFailure'

function parseLogMode(value: string | null): LogMode {
  if (value === 'summary' || value === 'errorsOnly' || value === 'tail' || value === 'aroundFailure') return value
  return 'full'
}

function selectLogs(logs: LogEntry[], mode: LogMode, limit: number) {
  if (mode === 'errorsOnly') return logs.filter(log => log.type === 'stderr')
  if (mode === 'tail') return logs.slice(-limit)
  if (mode === 'aroundFailure') {
    const failureIndex = logs.findIndex(log => log.type === 'stderr' || /fail|error|exception/i.test(log.message))
    if (failureIndex === -1) return logs.slice(-limit)
    const before = Math.max(failureIndex - Math.floor(limit / 2), 0)
    return logs.slice(before, before + limit)
  }
  if (mode === 'summary') {
    const errors = logs.filter(log => log.type === 'stderr')
    return [...logs.slice(0, 3), ...errors.slice(0, 5), ...logs.slice(-3)]
  }
  return logs
}

async function storedLogsResponse(input: {
  runId: string
  status: TestRunStatus
  wantsText: boolean
  mode: LogMode
  limit: number
  expectedTargetProjectId?: string
}) {
  const allLogs = await getTestRunLogsService(input.runId, input.expectedTargetProjectId)
  const logs = selectLogs(allLogs, input.mode, input.limit)
  if (input.wantsText) {
    return new Response(logs.map(log => `[${log.type}] ${log.message}`).join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  }

  return Response.json(
    {
      runId: input.runId,
      status: input.status,
      mode: input.mode,
      totalLogEntries: allLogs.length,
      logs,
    },
    { headers: { 'Cache-Control': 'no-cache' } },
  )
}

function sseErrorResponse(status: number, payload: Record<string, unknown>) {
  const errorStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const message = `event: error\ndata: ${JSON.stringify(payload)}\n\n`
      controller.enqueue(encoder.encode(message))
      setTimeout(() => {
        controller.close()
      }, 100)
    },
  })

  return new Response(errorStream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

function storedLogsErrorResponse(error: unknown, runId: string) {
  const status = error instanceof ServiceError && error.statusCode === 409 ? 409 : 404
  return Response.json(
    {
      error: status === 409 ? 'Test run log integrity conflict.' : 'Test run logs not found.',
      code: status === 409 ? 'CONFLICT' : 'NOT_FOUND',
      runId,
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

async function readTestRunStatusForLogs(runId: string, targetProjectId: string) {
  try {
    const testRun = await prisma.testRun.findFirst({
      where: { runId, targetProjectId },
      select: { id: true, status: true },
    })

    if (!testRun) {
      console.error(`[SSE] Test run not found in database for runId: ${runId}`)
      return { response: sseErrorResponse(404, { error: 'Test run not found' }) }
    }

    return { status: testRun.status }
  } catch (error) {
    console.error(`[SSE] Database error verifying test run for runId: ${runId}:`, error)
    return { response: sseErrorResponse(500, { error: 'Internal server error' }) }
  }
}

async function waitForRegisteredProcess(runId: string) {
  let process = processManager.get(runId)
  const maxWaitTime = 10000
  const checkInterval = 200
  let waited = 0

  while (!process && waited < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval))
    waited += checkInterval
    process = processManager.get(runId)
  }

  if (process) return { process }

  return {
    response: sseErrorResponse(200, {
      error: 'Test run process not found. The process may not have started yet or may have already completed.',
      details: `No active process is registered for this run after ${waited}ms.`,
    }),
  }
}

/**
 * Server-Sent Events (SSE) route handler for streaming test run logs
 *
 * This endpoint streams logs from a running test process to the client
 * using Server-Sent Events. It listens to TaskSpawner stdout/stderr events
 * and forwards them as SSE messages.
 *
 * Security: Verifies test run exists in database before allowing access.
 * TODO: Add user authentication check when authentication is implemented.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const acceptsEventStream = request.headers.get('accept')?.includes('text/event-stream') ?? false
  const wantsText =
    request.nextUrl.searchParams.get('format') === 'text' || request.headers.get('accept') === 'text/plain'
  const mode = parseLogMode(request.nextUrl.searchParams.get('mode'))
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 50) || 50, 1), 500)
  const expectedTargetProjectId =
    request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ??
    request.nextUrl.searchParams.get('targetProjectId') ??
    undefined
  if (!expectedTargetProjectId) return Response.json({ error: 'Test run not found.' }, { status: 404 })

  const statusResult = await readTestRunStatusForLogs(runId, expectedTargetProjectId)
  if ('response' in statusResult) return statusResult.response

  if (
    statusResult.status === TestRunStatus.COMPLETED ||
    statusResult.status === TestRunStatus.CANCELLED ||
    !acceptsEventStream
  ) {
    try {
      return await storedLogsResponse({
        runId,
        status: statusResult.status,
        wantsText,
        mode,
        limit,
        expectedTargetProjectId,
      })
    } catch (error) {
      return storedLogsErrorResponse(error, runId)
    }
  }

  const processResult = await waitForRegisteredProcess(runId)
  if ('response' in processResult) return processResult.response
  const process = processResult.process

  // Store cleanup function reference for cancel handler
  let cleanupRef: (() => void) | null = null

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let isClosed = false
      let errorOccurred = false
      let errorLogged = false // Track if we've already logged the error to avoid spam

      /**
       * Helper function to safely close the controller
       */
      const safeClose = () => {
        if (!isClosed) {
          try {
            controller.close()
            isClosed = true
          } catch {
            // Controller may already be closed
          }
        }
      }

      /**
       * Helper function to send SSE message
       * Flushes immediately to ensure real-time streaming
       */
      const sendSSE = (event: string, data: string) => {
        // Early return if stream is closed or error occurred
        if (isClosed || errorOccurred) return

        try {
          const message = `event: ${event}\ndata: ${data}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          // Only log error once to avoid infinite spam
          if (!errorLogged) {
            console.error(`[SSE] Error sending ${event} event:`, error)
            errorLogged = true
          }

          // Mark error occurred and immediately cleanup
          errorOccurred = true
          isClosed = true

          // Immediately cleanup listeners to prevent further events
          cleanup()
          safeClose()
        }
      }

      /**
       * Check if a line is an event JSON (should not be displayed in logs)
       */
      const isEventJson = (line: string): boolean => {
        try {
          const trimmed = line.trim()
          if (!trimmed.startsWith('{') || !trimmed.includes('"event"')) {
            return false
          }
          const parsed = JSON.parse(trimmed)
          return parsed.event === 'scenario::end' || parsed.event !== undefined
        } catch {
          return false
        }
      }

      const sendFilteredProcessOutput = (type: 'stdout' | 'stderr', processName: string, data: string) => {
        if (errorOccurred || processName !== process.name) return

        const filteredLines = data.split('\n').filter(line => {
          const trimmed = line.trim()
          return trimmed && !isEventJson(trimmed)
        })

        if (filteredLines.length > 0) {
          sendSSE('log', JSON.stringify({ type, message: filteredLines.join('\n') }))
        }
      }

      /**
       * Handler for stdout events
       */
      const onStdout = ({ processName, data }: { processName: string; data: string }) => {
        sendFilteredProcessOutput('stdout', processName, data)
      }

      /**
       * Handler for stderr events
       */
      const onStderr = ({ processName, data }: { processName: string; data: string }) => {
        sendFilteredProcessOutput('stderr', processName, data)
      }

      /**
       * Handler for process exit
       */
      const onExit = ({ processName, code }: { processName: string; code: number | null }) => {
        // Early return if error occurred to prevent infinite loops
        if (errorOccurred) {
          // Still cleanup on exit even if error occurred
          cleanup()
          safeClose()
          return
        }

        if (processName === process.name) {
          sendSSE('exit', JSON.stringify({ code }))
          // Close the stream after sending exit event
          setTimeout(() => {
            cleanup()
            safeClose()
          }, 100)
        }
      }

      /**
       * Handler for process errors
       */
      const onError = ({ processName, error }: { processName: string; error: Error }) => {
        // Early return if error occurred to prevent infinite loops
        if (errorOccurred) return

        if (processName === process.name) {
          sendSSE('error', JSON.stringify({ message: error.message }))
        }
      }

      /**
       * Handler for scenario::end events from ProcessManager
       */
      const onScenarioEnd = (eventData: {
        testRunId: string
        scenarioName: string
        status: string
        tracePath?: string
        featureName?: string
        scenarioTags?: string[]
      }) => {
        // Early return if error occurred to prevent infinite loops
        if (errorOccurred) return

        console.log(
          `[SSE] Received scenario::end event for testRunId: ${eventData.testRunId}, runId: ${runId}`,
          eventData,
        )
        if (eventData.testRunId === runId) {
          console.log(`[SSE] Sending scenario::end SSE event for scenario: ${eventData.scenarioName}`)
          sendSSE(
            'scenario::end',
            JSON.stringify({
              featureName: eventData.featureName,
              scenarioName: eventData.scenarioName,
              scenarioTags: eventData.scenarioTags,
              status: eventData.status,
              tracePath: eventData.tracePath,
            }),
          )
        } else {
          console.log(`[SSE] Ignoring scenario::end event - testRunId mismatch: ${eventData.testRunId} !== ${runId}`)
        }
      }

      // Clean up listeners helper (defined before use)
      const cleanup = () => {
        taskSpawner.removeListener('stdout', onStdout)
        taskSpawner.removeListener('stderr', onStderr)
        taskSpawner.removeListener('exit', onExit)
        taskSpawner.removeListener('error', onError)
        processManager.removeListener('scenario::end', onScenarioEnd)
      }

      // Store cleanup reference for cancel handler
      cleanupRef = cleanup

      // Set up event listeners on TaskSpawner
      taskSpawner.on('stdout', onStdout)
      taskSpawner.on('stderr', onStderr)
      taskSpawner.on('exit', onExit)
      taskSpawner.on('error', onError)

      // Listen for scenario::end events from ProcessManager
      processManager.on('scenario::end', onScenarioEnd)

      console.log(`[SSE] Connected to log stream for runId: ${runId}`)

      // Send initial connection message
      sendSSE('connected', JSON.stringify({ message: 'Connected to log stream' }))

      // Send any already captured output immediately (filter out event JSON)
      if (process.output && (process.output.stdout.length > 0 || process.output.stderr.length > 0)) {
        process.output.stdout.forEach(line => {
          const trimmed = line.trim()
          // Skip event JSON lines
          if (trimmed && !isEventJson(trimmed)) {
            sendSSE('log', JSON.stringify({ type: 'stdout', message: line }))
          }
        })
        process.output.stderr.forEach(line => {
          const trimmed = line.trim()
          // Skip event JSON lines
          if (trimmed && !isEventJson(trimmed)) {
            sendSSE('log', JSON.stringify({ type: 'stderr', message: line }))
          }
        })
      }

      // Check if process has already exited (race condition check after listeners are set up)
      // We check this after setting up listeners in case exit event was emitted during setup
      if (!process.isRunning && process.exitCode !== null) {
        sendSSE('exit', JSON.stringify({ code: process.exitCode }))
        // Don't close immediately - let any pending events be sent first
        setTimeout(() => {
          cleanup()
          safeClose()
        }, 500)
        return
      }

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        errorOccurred = true
        cleanup()
        safeClose()
      })
    },
    cancel() {
      // Handle stream cancellation (client closes connection)
      // Cleanup listeners if they were set up
      if (cleanupRef) {
        cleanupRef()
        cleanupRef = null
      }
    },
  })

  // Return SSE response with appropriate headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
