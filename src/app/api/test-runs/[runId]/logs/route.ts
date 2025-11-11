import { NextRequest } from 'next/server'
import { processManager } from '@/lib/test-run/process-manager'
import { taskSpawner } from '@/tests/utils/spawner.util'
import prisma from '@/config/db-config'

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

  // Verify test run exists in database before allowing access
  // TODO: Add user authentication check here when authentication is implemented
  // Example: where: { runId, userId: currentUser.id }
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { runId },
      select: { id: true }, // Only need to verify existence
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
  const maxWaitTime = 5000 // 5 seconds
  const checkInterval = 100 // Check every 100ms
  let waited = 0

  while (!process && waited < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval))
    waited += checkInterval
    process = processManager.get(runId)
  }

  if (!process) {
    console.error(
      `[SSE] Process not found for runId: ${runId} after ${waited}ms. Available processes: ${processManager.size()}`,
    )
    // Return an SSE stream with an error event instead of JSON response
    // This allows EventSource to properly handle the error
    const errorStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        const message = `event: error\ndata: ${JSON.stringify({ error: 'Test run not found or process not running. The process may not have started yet.' })}\n\n`
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

  console.log(
    `[SSE] Found process for runId: ${runId} after ${waited}ms, process name: ${process.name}, isRunning: ${process.isRunning}`,
  )

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      /**
       * Helper function to send SSE message
       * Flushes immediately to ensure real-time streaming
       */
      const sendSSE = (event: string, data: string) => {
        try {
          const message = `event: ${event}\ndata: ${data}\n\n`
          controller.enqueue(encoder.encode(message))
          console.log(`[SSE] Sent ${event} event for runId: ${runId}`)
        } catch (error) {
          console.error(`[SSE] Error sending ${event} event:`, error)
        }
      }

      /**
       * Handler for stdout events
       */
      const onStdout = ({ processName, data }: { processName: string; data: string }) => {
        console.log(
          `[SSE] Received stdout event - processName: ${processName}, expected: ${process.name}, match: ${processName === process.name}`,
        )
        if (processName === process.name) {
          sendSSE('log', JSON.stringify({ type: 'stdout', message: data }))
        }
      }

      /**
       * Handler for stderr events
       */
      const onStderr = ({ processName, data }: { processName: string; data: string }) => {
        console.log(
          `[SSE] Received stderr event - processName: ${processName}, expected: ${process.name}, match: ${processName === process.name}`,
        )
        if (processName === process.name) {
          sendSSE('log', JSON.stringify({ type: 'stderr', message: data }))
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
            controller.close()
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

      // Clean up listeners helper (defined before use)
      const cleanup = () => {
        taskSpawner.removeListener('stdout', onStdout)
        taskSpawner.removeListener('stderr', onStderr)
        taskSpawner.removeListener('exit', onExit)
        taskSpawner.removeListener('error', onError)
      }

      // Log current listener count before adding
      const stdoutListeners = taskSpawner.listenerCount('stdout')
      const stderrListeners = taskSpawner.listenerCount('stderr')
      console.log(`[SSE] Current listeners - stdout: ${stdoutListeners}, stderr: ${stderrListeners}`)

      // Set up event listeners on TaskSpawner
      taskSpawner.on('stdout', onStdout)
      taskSpawner.on('stderr', onStderr)
      taskSpawner.on('exit', onExit)
      taskSpawner.on('error', onError)

      console.log(`[SSE] Event listeners set up for process: ${process.name}`)
      console.log(
        `[SSE] After setup - stdout listeners: ${taskSpawner.listenerCount('stdout')}, stderr listeners: ${taskSpawner.listenerCount('stderr')}`,
      )

      // Send initial connection message
      sendSSE('connected', JSON.stringify({ message: 'Connected to log stream' }))

      // Send any already captured output immediately
      if (process.output && (process.output.stdout.length > 0 || process.output.stderr.length > 0)) {
        console.log(
          `[SSE] Sending buffered output - stdout: ${process.output.stdout.length} lines, stderr: ${process.output.stderr.length} lines`,
        )
        process.output.stdout.forEach(line => {
          sendSSE('log', JSON.stringify({ type: 'stdout', message: line }))
        })
        process.output.stderr.forEach(line => {
          sendSSE('log', JSON.stringify({ type: 'stderr', message: line }))
        })
      }

      // Check if process has already exited (race condition check after listeners are set up)
      // We check this after setting up listeners in case exit event was emitted during setup
      if (!process.isRunning && process.exitCode !== null) {
        console.log(`[SSE] Process already exited with code: ${process.exitCode}, sending exit event`)
        sendSSE('exit', JSON.stringify({ code: process.exitCode }))
        // Don't close immediately - let any pending events be sent first
        setTimeout(() => {
          cleanup()
          try {
            controller.close()
          } catch (error) {
            // Stream may already be closed
            console.error(`[SSE] Error closing controller:`, error)
          }
        }, 500)
        return
      }

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch (error) {
          // Stream may already be closed
          console.error(`[SSE] Error closing controller:`, error)
        }
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
