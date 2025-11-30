import { NextRequest } from 'next/server'
import { processManager } from '@/lib/test-run/process-manager'
import { taskSpawner } from '@/tests/utils/spawner.util'
import prisma from '@/config/db-config'
import { TestRunStatus } from '@prisma/client'

// Ensure this route runs in Node.js runtime (not Edge) for singleton to work
export const runtime = 'nodejs'

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

  // Verify test run exists in database and check status
  // TODO: Add user authentication check here when authentication is implemented
  // Example: where: { runId, userId: currentUser.id }
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { runId },
      select: { id: true, status: true }, // Need status to check if completed
    })

    if (!testRun) {
      console.error(`[SSE] Test run not found in database for runId: ${runId}`)
      const errorStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          const message = `event: error\ndata: ${JSON.stringify({ error: 'Test run not found' })}\n\n`
          controller.enqueue(encoder.encode(message))
          setTimeout(() => {
            controller.close()
          }, 100)
        },
      })

      return new Response(errorStream, {
        status: 404,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }

    // If test run is completed, reject SSE connection - logs should be loaded from DB
    if (testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED) {
      console.log(`[SSE] Test run ${runId} is ${testRun.status}, rejecting SSE connection`)
      const errorStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          const message = `event: error\ndata: ${JSON.stringify({ error: 'Test run has completed. Logs are available in the database.' })}\n\n`
          controller.enqueue(encoder.encode(message))
          setTimeout(() => {
            controller.close()
          }, 100)
        },
      })

      return new Response(errorStream, {
        status: 200, // Return 200 but with error event so client can handle it
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }
  } catch (error) {
    console.error(`[SSE] Database error verifying test run for runId: ${runId}:`, error)
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const message = `event: error\ndata: ${JSON.stringify({ error: 'Internal server error' })}\n\n`
        controller.enqueue(encoder.encode(message))
        setTimeout(() => {
          controller.close()
        }, 100)
      },
    })

    return new Response(errorStream, {
      status: 500,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  // Wait for process to be registered (with timeout)
  // This handles the race condition where the page loads before the process is spawned
  let process = processManager.get(runId)
  const maxWaitTime = 10000 // Increase to 10 seconds
  const checkInterval = 200 // Check every 200ms
  let waited = 0

  console.log(`[SSE] Looking for process with runId: ${runId}, current processes: ${processManager.size()}`)
  
  // Log all available process IDs for debugging
  if (processManager.size() > 0) {
    const availableProcesses = processManager.getAllTestRunIds()
    console.log(`[SSE] Available process IDs:`, availableProcesses)
    console.log(`[SSE] Looking for runId: "${runId}", available:`, availableProcesses.map(id => `"${id}"`).join(', '))
  } else {
    console.log(`[SSE] No processes registered yet. ProcessManager size: ${processManager.size()}`)
  }

  while (!process && waited < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval))
    waited += checkInterval
    process = processManager.get(runId)
    
    // Log progress every 2 seconds
    if (waited % 2000 === 0) {
      console.log(`[SSE] Still waiting for process ${runId}... (${waited}ms elapsed)`)
    }
  }

  if (!process) {
    const availableProcesses = processManager.getAllTestRunIds()
    const errorMessage = `Process not found for runId: ${runId} after ${waited}ms. Available processes: ${processManager.size()}. Available IDs: ${availableProcesses.join(', ') || 'none'}`
    console.error(`[SSE] ${errorMessage}`)
    
    // Return an SSE stream with an error event instead of JSON response
    // This allows EventSource to properly handle the error
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const message = `event: error\ndata: ${JSON.stringify({ 
          error: 'Test run process not found. The process may not have started yet or may have already completed.',
          details: `Looking for: ${runId}, Available: ${availableProcesses.join(', ') || 'none'}`,
        })}\n\n`
        controller.enqueue(encoder.encode(message))
        setTimeout(() => {
          controller.close()
        }, 100)
      },
    })

    return new Response(errorStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  }

  // Process found, proceed with SSE connection

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let isClosed = false

      /**
       * Helper function to safely close the controller
       */
      const safeClose = () => {
        if (!isClosed) {
          try {
            controller.close()
            isClosed = true
          } catch (error) {
            // Controller may already be closed
          }
        }
      }

      /**
       * Helper function to send SSE message
       * Flushes immediately to ensure real-time streaming
       */
      const sendSSE = (event: string, data: string) => {
        if (isClosed) return
        try {
          const message = `event: ${event}\ndata: ${data}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          console.error(`[SSE] Error sending ${event} event:`, error)
          isClosed = true
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

      /**
       * Handler for stdout events
       */
      const onStdout = ({ processName, data }: { processName: string; data: string }) => {
        if (processName === process.name) {
          // Filter out event JSON lines - they're for internal processing only
          const lines = data.split('\n')
          const filteredLines = lines.filter(line => {
            const trimmed = line.trim()
            return trimmed && !isEventJson(trimmed)
          })
          
          if (filteredLines.length > 0) {
            sendSSE('log', JSON.stringify({ type: 'stdout', message: filteredLines.join('\n') }))
          }
        }
      }

      /**
       * Handler for stderr events
       */
      const onStderr = ({ processName, data }: { processName: string; data: string }) => {
        if (processName === process.name) {
          // Filter out event JSON lines - they're for internal processing only
          const lines = data.split('\n')
          const filteredLines = lines.filter(line => {
            const trimmed = line.trim()
            return trimmed && !isEventJson(trimmed)
          })
          
          if (filteredLines.length > 0) {
            sendSSE('log', JSON.stringify({ type: 'stderr', message: filteredLines.join('\n') }))
          }
        }
      }

      /**
       * Handler for process exit
       */
      const onExit = ({ processName, code }: { processName: string; code: number | null }) => {
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
        if (processName === process.name) {
          sendSSE('error', JSON.stringify({ message: error.message }))
        }
      }

      /**
       * Handler for scenario::end events from ProcessManager
       */
      const onScenarioEnd = (eventData: { testRunId: string; scenarioName: string; status: string; tracePath?: string }) => {
        console.log(`[SSE] Received scenario::end event for testRunId: ${eventData.testRunId}, runId: ${runId}`, eventData)
        if (eventData.testRunId === runId) {
          console.log(`[SSE] Sending scenario::end SSE event for scenario: ${eventData.scenarioName}`)
          sendSSE('scenario::end', JSON.stringify({
            scenarioName: eventData.scenarioName,
            status: eventData.status,
            tracePath: eventData.tracePath,
          }))
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
        cleanup()
        safeClose()
      })
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
