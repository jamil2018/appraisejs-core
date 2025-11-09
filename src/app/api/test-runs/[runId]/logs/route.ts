import { NextRequest } from 'next/server'
import { processManager } from '@/lib/test-run/process-manager'
import { taskSpawner } from '@/tests/utils/spawner.util'

/**
 * Server-Sent Events (SSE) route handler for streaming test run logs
 * 
 * This endpoint streams logs from a running test process to the client
 * using Server-Sent Events. It listens to TaskSpawner stdout/stderr events
 * and forwards them as SSE messages.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  // Look up the process in ProcessManager
  const process = processManager.get(runId)

  if (!process) {
    return new Response(
      JSON.stringify({ error: 'Test run not found or process not running' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      /**
       * Helper function to send SSE message
       */
      const sendSSE = (event: string, data: string) => {
        const message = `event: ${event}\ndata: ${data}\n\n`
        controller.enqueue(encoder.encode(message))
      }

      /**
       * Handler for stdout events
       */
      const onStdout = ({ processName, data }: { processName: string; data: string }) => {
        if (processName === process.name) {
          sendSSE('log', JSON.stringify({ type: 'stdout', message: data }))
        }
      }

      /**
       * Handler for stderr events
       */
      const onStderr = ({ processName, data }: { processName: string; data: string }) => {
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

      // Set up event listeners on TaskSpawner
      taskSpawner.on('stdout', onStdout)
      taskSpawner.on('stderr', onStderr)
      taskSpawner.on('exit', onExit)
      taskSpawner.on('error', onError)

      // Send initial connection message
      sendSSE('connected', JSON.stringify({ message: 'Connected to log stream' }))

      // If process has already exited, send exit event and close
      if (!process.isRunning && process.exitCode !== null) {
        sendSSE('exit', JSON.stringify({ code: process.exitCode }))
        setTimeout(() => {
          controller.close()
        }, 100)
        return
      }

      // Clean up listeners helper
      const cleanup = () => {
        taskSpawner.removeListener('stdout', onStdout)
        taskSpawner.removeListener('stderr', onStderr)
        taskSpawner.removeListener('exit', onExit)
        taskSpawner.removeListener('error', onError)
      }

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch (error) {
          // Stream may already be closed
        }
      })
    },
  })

  // Return SSE response with appropriate headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

