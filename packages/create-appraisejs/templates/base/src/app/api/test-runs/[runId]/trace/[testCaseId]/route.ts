import { NextRequest, NextResponse } from 'next/server'
import { taskSpawner } from '@/lib/process/task-spawner'
import prisma from '@/config/db-config'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { opaqueArtifactError } from '@/app/api/test-runs/artifact-route-error'
import { spawnTraceViewerFromSnapshot } from '@/services/test-run/trace-viewer-snapshot-service'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project'

// Ensure this route runs in Node.js runtime (not Edge) for singleton to work
export const runtime = 'nodejs'

type TraceRouteContext = { params: Promise<{ runId: string; testCaseId: string }> }

async function loadTraceTestRun(runId: string, testCaseId: string, targetProjectId: string) {
  return prisma.testRun.findFirst({
    where: { runId, targetProjectId },
    include: {
      testCases: {
        where: { id: testCaseId },
        include: { testCase: true },
      },
    },
  })
}

function traceAccessError(testRun: Awaited<ReturnType<typeof loadTraceTestRun>>, testCaseId: string) {
  if (!testRun) return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
  if (!testRun.testCases.some(testCase => testCase.id === testCaseId))
    return NextResponse.json({ error: 'Test case not found in this test run' }, { status: 404 })
  return null
}

async function traceRequestContext(request: NextRequest, context: TraceRouteContext) {
  const { runId, testCaseId } = await context.params
  const targetProjectId =
    request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? request.nextUrl.searchParams.get('targetProjectId')
  if (!targetProjectId)
    return {
      runId,
      testCaseId,
      testRun: null,
      targetProjectId: null,
      accessError: NextResponse.json({ error: 'Test run not found' }, { status: 404 }),
    }
  const testRun = await loadTraceTestRun(runId, testCaseId, targetProjectId)
  const accessError = traceAccessError(testRun, testCaseId)
  return { runId, testCaseId, testRun, targetProjectId, accessError }
}

/**
 * GET handler for checking if trace viewer is running
 *
 * This endpoint checks if a trace viewer process is currently running for a test case.
 */
export async function GET(request: NextRequest, context: TraceRouteContext) {
  try {
    const { testCaseId, accessError } = await traceRequestContext(request, context)
    if (accessError) return accessError

    // Check if trace viewer process is running
    const processName = `trace-viewer-${testCaseId}`
    const process = taskSpawner.getProcess(processName)
    const isRunning = process?.isRunning ?? false

    return NextResponse.json({
      isRunning,
      processName: isRunning ? processName : null,
    })
  } catch (error) {
    return opaqueArtifactError(error)
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
export async function POST(request: NextRequest, context: TraceRouteContext) {
  try {
    const { runId, testCaseId, testRun, accessError } = await traceRequestContext(request, context)
    if (accessError) return accessError
    if (!testRun) return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    const expectedTargetProjectId =
      request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? request.nextUrl.searchParams.get('targetProjectId')

    // Verify test case belongs to this test run
    const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
    if (!testRunTestCase) return NextResponse.json({ error: 'Test case not found in this test run' }, { status: 404 })

    // Get trace path from database
    const tracePath = testRunTestCase.tracePath
    if (!tracePath) {
      return NextResponse.json({ error: 'No trace path available for this test case' }, { status: 400 })
    }

    const artifact = await new TestRunArtifactAccessService(prisma).readBytes({
      runId,
      kind: 'trace',
      testCaseId,
      storedPath: tracePath,
      expectedTargetProjectId: expectedTargetProjectId ?? undefined,
    })
    const spawnedProcess = await spawnTraceViewerFromSnapshot(artifact.bytes, traceViewerPath =>
      taskSpawner.spawn('npx', ['playwright', 'show-trace', traceViewerPath], {
        streamLogs: true,
        prefixLogs: true,
        logPrefix: `trace-viewer-${testCaseId}`,
        captureOutput: false,
      }),
    )

    return NextResponse.json({
      success: true,
      message: 'Trace viewer launched successfully',
      processName: spawnedProcess.name,
    })
  } catch (error) {
    return opaqueArtifactError(error)
  }
}
