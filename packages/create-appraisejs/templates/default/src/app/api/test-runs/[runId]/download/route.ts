import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/config/db-config'
import archiver from 'archiver'
import { promises as fs } from 'fs'
import path from 'path'
import { getAutomationReportRunDir, resolveStoredPath } from '@/lib/automation/paths'

// Ensure this route runs in Node.js runtime (not Edge) for file system access
export const runtime = 'nodejs'

async function collectRunArtifactFiles(
  dir: string,
  baseDir = dir,
): Promise<Array<{ absolutePath: string; archivePath: string }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: Array<{ absolutePath: string; archivePath: string }> = []

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await collectRunArtifactFiles(absolutePath, baseDir)))
        continue
      }

      files.push({
        absolutePath,
        archivePath: path.relative(baseDir, absolutePath).replace(/\\/g, '/'),
      })
    }

    return files
  } catch {
    return []
  }
}

/**
 * GET handler for downloading a test run's stored artifacts as a zip file
 *
 * This endpoint:
 * - Verifies the test run exists
 * - Collects the run folder artifacts when present
 * - Falls back to legacy log/trace paths for older runs
 * - Creates a zip file containing all files
 * - Returns the zip file as a downloadable response
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({
      where: { runId },
      include: {
        testCases: {
          select: {
            id: true,
            tracePath: true,
          },
        },
      },
    })

    if (!testRun) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }

    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    })

    // Track if we have any files to add
    let hasFiles = false

    const runArtifactFiles = await collectRunArtifactFiles(getAutomationReportRunDir(runId))
    for (const artifactFile of runArtifactFiles) {
      archive.file(artifactFile.absolutePath, { name: artifactFile.archivePath })
      hasFiles = true
    }

    if (!hasFiles && testRun.logPath) {
      try {
        const logPath = resolveStoredPath(testRun.logPath)
        await fs.access(logPath)
        archive.file(logPath, { name: `logs/${path.basename(logPath)}` })
        hasFiles = true
      } catch {
        console.warn(`[Download] Log file not found at path: ${testRun.logPath}`)
      }
    }

    if (!hasFiles) {
      const traceFiles = testRun.testCases.filter(tc => tc.tracePath).map(tc => tc.tracePath!)
      for (const tracePath of traceFiles) {
        try {
          const resolvedTracePath = resolveStoredPath(tracePath)
          await fs.access(resolvedTracePath)
          archive.file(resolvedTracePath, { name: `traces/${path.basename(resolvedTracePath)}` })
          hasFiles = true
        } catch {
          console.warn(`[Download] Trace file not found at path: ${tracePath}`)
        }
      }
    }

    // If no files to add, return an error
    if (!hasFiles) {
      return NextResponse.json({ error: 'No run artifacts available for this test run' }, { status: 404 })
    }

    // Create a readable stream to collect the archive data
    const chunks: Buffer[] = []

    // Set up event handlers before finalizing
    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      archive.on('end', () => {
        const zipBuffer = Buffer.concat(chunks)
        resolve(zipBuffer)
      })

      archive.on('error', err => {
        reject(err)
      })
    })

    // Finalize the archive
    archive.finalize()

    // Wait for the archive to complete
    const zipBuffer = await archivePromise

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `test-run-${runId}-${timestamp}.zip`

    // Return the zip file as a downloadable response (Uint8Array for BodyInit)
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error(`[Download] Error creating zip file for testRunId: ${runId}:`, error)
    return NextResponse.json(
      {
        error: 'Failed to create download file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
