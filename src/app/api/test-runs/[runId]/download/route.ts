import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/config/db-config'
import archiver from 'archiver'
import { promises as fs } from 'fs'
import path from 'path'

// Ensure this route runs in Node.js runtime (not Edge) for file system access
export const runtime = 'nodejs'

/**
 * GET handler for downloading test run logs and traces as a zip file
 *
 * This endpoint:
 * - Verifies the test run exists
 * - Collects the log file (if exists)
 * - Collects all trace files from test cases (if any)
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

    // Add log file if it exists
    if (testRun.logPath) {
      try {
        await fs.access(testRun.logPath)
        const logFileName = path.basename(testRun.logPath)
        archive.file(testRun.logPath, { name: `logs/${logFileName}` })
        hasFiles = true
      } catch {
        // Log file doesn't exist, skip it
        console.warn(`[Download] Log file not found at path: ${testRun.logPath}`)
      }
    }

    // Add trace files if they exist
    const traceFiles = testRun.testCases.filter(tc => tc.tracePath).map(tc => tc.tracePath!)
    for (const tracePath of traceFiles) {
      try {
        await fs.access(tracePath)
        const traceFileName = path.basename(tracePath)
        archive.file(tracePath, { name: `traces/${traceFileName}` })
        hasFiles = true
      } catch {
        // Trace file doesn't exist, skip it
        console.warn(`[Download] Trace file not found at path: ${tracePath}`)
      }
    }

    // If no files to add, return an error
    if (!hasFiles) {
      return NextResponse.json(
        { error: 'No log or trace files available for this test run' },
        { status: 404 },
      )
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

      archive.on('error', (err) => {
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

    // Return the zip file as a downloadable response
    return new NextResponse(zipBuffer, {
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

