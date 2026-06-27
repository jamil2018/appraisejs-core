import { NextResponse } from 'next/server'
import { promises as fs, createReadStream } from 'fs'
import { Readable } from 'stream'
import prisma from '@/config/db-config'
import { resolveStoredPath } from '@/lib/automation/automation-path-roots'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params

  try {
    const step = await prisma.reportStep.findUnique({
      where: { id: stepId },
      select: {
        screenshotPath: true,
        reportScenario: {
          select: {
            reportFeature: {
              select: {
                report: {
                  select: {
                    testRun: {
                      select: {
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

    const projectRoot = step.reportScenario?.reportFeature.report.testRun.targetProject?.canonicalPath
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
    console.error(`[ReportScreenshot] Failed to serve screenshot for step ${stepId}:`, error)
    return NextResponse.json(
      {
        error: 'Failed to load screenshot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
