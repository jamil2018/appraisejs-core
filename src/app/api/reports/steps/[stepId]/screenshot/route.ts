import { NextResponse } from 'next/server'
import { promises as fs, createReadStream } from 'fs'
import { Readable } from 'stream'
import prisma from '@/config/db-config'
import { resolveStoredPath } from '@/lib/automation/automation-path-roots'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { opaqueArtifactError } from '@/app/api/test-runs/artifact-route-error'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params

  try {
    const step = await prisma.reportStep.findUnique({
      where: { id: stepId },
      select: {
        screenshotPath: true,
        reportScenario: {
          select: {
            reportTestCases: { select: { testRunTestCaseId: true }, take: 1 },
            reportFeature: {
              select: {
                report: {
                  select: {
                    testRun: {
                      select: {
                        runId: true,
                        targetProjectId: true,
                        runtimeCapsule: { select: { id: true } },
                        targetProject: {
                          select: { canonicalPath: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!step) {
      return NextResponse.json({ error: 'Report step not found' }, { status: 404 })
    }

    if (!step.screenshotPath) {
      return NextResponse.json({ error: 'Screenshot not available for this step' }, { status: 404 })
    }

    const testRun = step.reportScenario?.reportFeature.report.testRun
    const projectRoot = testRun?.targetProject?.canonicalPath
    const expectedTargetProjectId = new URL(request.url).searchParams.get('targetProjectId')
    if (testRun?.runtimeCapsule && testRun.targetProjectId !== expectedTargetProjectId)
      return NextResponse.json({ error: 'Report step not found' }, { status: 404 })
    if (testRun?.runtimeCapsule) {
      const artifact = await new TestRunArtifactAccessService(prisma).readBytes({
        runId: testRun.runId,
        kind: 'screenshot',
        testCaseId: step.reportScenario?.reportTestCases[0]?.testRunTestCaseId,
        storedPath: step.screenshotPath,
        expectedTargetProjectId: expectedTargetProjectId ?? undefined,
      })
      return new NextResponse(new Uint8Array(artifact.bytes), {
        headers: { 'Content-Type': artifact.contentType, 'Cache-Control': 'private, max-age=60' },
      })
    }
    const screenshotPath = resolveStoredPath(step.screenshotPath, projectRoot)

    try {
      await fs.access(screenshotPath)
    } catch {
      return NextResponse.json({ error: 'Screenshot file not found' }, { status: 404 })
    }

    return new NextResponse(Readable.toWeb(createReadStream(screenshotPath)) as ReadableStream, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (error) {
    return opaqueArtifactError(error)
  }
}
