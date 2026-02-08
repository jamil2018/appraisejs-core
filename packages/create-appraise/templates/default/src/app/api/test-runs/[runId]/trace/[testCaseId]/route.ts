import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { taskSpawner } from '@/tests/utils/spawner.util'
import prisma from '@/config/db-config'
import path from 'path'

// Ensure this route runs in Node.js runtime (not Edge) for singleton to work
export const runtime = 'nodejs'

/**
 * GET handler for checking if trace viewer is running
 *
 * This endpoint checks if a trace viewer process is currently running for a test case.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; testCaseId: string }> },
) {
  const { runId, testCaseId } = await params

  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({
      where: { runId },
      include: {
        testCases: {
          where: { id: testCaseId },
        },
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }

    // Verify test case belongs to this test run
    const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
    if (!testRunTestCase) {
      return NextResponse.json({ error: 'Test case not found in this test run' }, { status: 404 })
    }

    // Check if trace viewer process is running
    const processName = `trace-viewer-${testCaseId}`
    const process = taskSpawner.getProcess(processName)
    const isRunning = process?.isRunning ?? false

    return NextResponse.json({
      isRunning,
      processName: isRunning ? processName : null,
    })
  } catch (error) {
    console.error(`[TraceViewer] Error checking trace viewer status for runId: ${runId}, testCaseId: ${testCaseId}:`, error)
    return NextResponse.json(
      {
        error: `Failed to check trace viewer status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 },
    )
  }
}

/**
 * POST handler for spawning Playwright trace viewer
 *
 * This endpoint spawns a process to open the Playwright trace viewer for a failed test scenario.
 * The process is self-closing and doesn't require cleanup.
 *
 * Security: Verifies test run and test case exist and belong together before allowing access.
 * TODO: Add user authentication check when authentication is implemented.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; testCaseId: string }> },
) {
  const { runId, testCaseId } = await params

  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({
      where: { runId },
      include: {
        testCases: {
          where: { id: testCaseId },
          include: {
            testCase: true,
          },
        },
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }

    // Verify test case belongs to this test run
    const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
    if (!testRunTestCase) {
      return NextResponse.json({ error: 'Test case not found in this test run' }, { status: 404 })
    }

    // Get trace path from database
    const tracePath = testRunTestCase.tracePath
    if (!tracePath) {
      return NextResponse.json({ error: 'No trace path available for this test case' }, { status: 400 })
    }

    // Validate trace file exists
    try {
      await fs.access(tracePath)
    } catch {
      return NextResponse.json(
        { error: `Trace file not found at path: ${tracePath}` },
        { status: 404 },
      )
    }

    // Resolve absolute path if relative
    const absoluteTracePath = path.isAbsolute(tracePath) ? tracePath : path.join(process.cwd(), tracePath)

    // Spawn playwright show-trace command
    // The process is self-closing when the user closes the trace viewer
    const spawnedProcess = await taskSpawner.spawn('npx', ['playwright', 'show-trace', absoluteTracePath], {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: `trace-viewer-${testCaseId}`,
      captureOutput: false, // No need to capture output for trace viewer
    })

    console.log(`[TraceViewer] Spawned trace viewer process for testCaseId: ${testCaseId}, tracePath: ${absoluteTracePath}`)

    return NextResponse.json({
      success: true,
      message: 'Trace viewer launched successfully',
      processName: spawnedProcess.name,
    })
  } catch (error) {
    console.error(`[TraceViewer] Error spawning trace viewer for runId: ${runId}, testCaseId: ${testCaseId}:`, error)
    return NextResponse.json(
      {
        error: `Failed to spawn trace viewer: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 },
    )
  }
}

