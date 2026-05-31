import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/config/db-config'
import archiver from 'archiver'
import { promises as fs } from 'fs'
import path from 'path'
import { getAutomationReportRunDir, resolveStoredPath } from '@/lib/automation/automation-path-roots'

// Ensure this route runs in Node.js runtime (not Edge) for file system access
export const runtime = 'nodejs'

type Archive = ReturnType<typeof archiver>
type ArtifactFile = { absolutePath: string; archivePath: string }
type DownloadTestRun = NonNullable<Awaited<ReturnType<typeof getDownloadTestRun>>>

async function collectRunArtifactFiles(dir: string, baseDir = dir): Promise<ArtifactFile[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files: ArtifactFile[] = []

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

async function addStoredArtifactFile(
  archive: Archive,
  storedPath: string,
  archivePath: string,
  warningLabel: string,
): Promise<boolean> {
  try {
    const resolvedPath = resolveStoredPath(storedPath)
    await fs.access(resolvedPath)
    archive.file(resolvedPath, { name: archivePath })
    return true
  } catch {
    console.warn(`[Download] ${warningLabel} not found at path: ${storedPath}`)
    return false
  }
}

function isPathWithinDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, targetPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

async function getDownloadTestRun(runId: string) {
  return prisma.testRun.findUnique({
    where: { runId },
    select: {
      logPath: true,
      reportPath: true,
      testCases: {
        select: {
          tracePath: true,
        },
      },
    },
  })
}

function createZipArchive() {
  return archiver('zip', {
    zlib: { level: 9 }, // Maximum compression
  })
}

function addRunArtifactFiles(archive: Archive, runArtifactFiles: ArtifactFile[]) {
  for (const artifactFile of runArtifactFiles) {
    archive.file(artifactFile.absolutePath, { name: artifactFile.archivePath })
  }

  return new Set<string>(runArtifactFiles.map(artifactFile => artifactFile.archivePath))
}

async function addLegacyReportFile(
  archive: Archive,
  testRun: DownloadTestRun,
  runArtifactDir: string,
  archivedPaths: Set<string>,
) {
  if (!testRun.reportPath) {
    return false
  }

  const resolvedReportPath = resolveStoredPath(testRun.reportPath)
  if (isPathWithinDirectory(resolvedReportPath, runArtifactDir) || archivedPaths.has('cucumber.json')) {
    return false
  }

  const didAddReportFile = await addStoredArtifactFile(archive, testRun.reportPath, 'cucumber.json', 'Report file')
  if (didAddReportFile) {
    archivedPaths.add('cucumber.json')
  }

  return didAddReportFile
}

async function addLegacyLogFile(
  archive: Archive,
  testRun: DownloadTestRun,
  runArtifactDir: string,
  archivedPaths: Set<string>,
) {
  if (!testRun.logPath) {
    return false
  }

  const resolvedLogPath = resolveStoredPath(testRun.logPath)
  const archivePath = `logs/${path.basename(testRun.logPath)}`
  if (isPathWithinDirectory(resolvedLogPath, runArtifactDir) || archivedPaths.has(archivePath)) {
    return false
  }

  const didAddLogFile = await addStoredArtifactFile(archive, testRun.logPath, archivePath, 'Log file')
  if (didAddLogFile) {
    archivedPaths.add(archivePath)
  }

  return didAddLogFile
}

async function addLegacyTraceFiles(
  archive: Archive,
  testRun: DownloadTestRun,
  runArtifactDir: string,
  archivedPaths: Set<string>,
) {
  let didAddAnyTraceFile = false
  const traceFiles = testRun.testCases.flatMap(({ tracePath }) => (tracePath ? [tracePath] : []))

  for (const tracePath of traceFiles) {
    const resolvedTracePath = resolveStoredPath(tracePath)
    const archivePath = `traces/${path.basename(tracePath)}`

    if (isPathWithinDirectory(resolvedTracePath, runArtifactDir) || archivedPaths.has(archivePath)) {
      continue
    }

    const didAddTraceFile = await addStoredArtifactFile(archive, tracePath, archivePath, 'Trace file')
    didAddAnyTraceFile = didAddTraceFile || didAddAnyTraceFile
    if (didAddTraceFile) {
      archivedPaths.add(archivePath)
    }
  }

  return didAddAnyTraceFile
}

async function addDownloadArtifacts(archive: Archive, testRun: DownloadTestRun, runArtifactDir: string) {
  const runArtifactFiles = await collectRunArtifactFiles(runArtifactDir)
  const archivedPaths = addRunArtifactFiles(archive, runArtifactFiles)
  const didAddReportFile = await addLegacyReportFile(archive, testRun, runArtifactDir, archivedPaths)
  const didAddLogFile = await addLegacyLogFile(archive, testRun, runArtifactDir, archivedPaths)
  const didAddTraceFile = await addLegacyTraceFiles(archive, testRun, runArtifactDir, archivedPaths)

  return runArtifactFiles.length > 0 || didAddReportFile || didAddLogFile || didAddTraceFile
}

function finalizeArchive(archive: Archive) {
  const chunks: Buffer[] = []

  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    archive.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    archive.on('error', err => {
      reject(err)
    })
  })

  archive.finalize()
  return archivePromise
}

function createZipDownloadResponse(zipBuffer: Buffer, runId: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `test-run-${runId}-${timestamp}.zip`

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  })
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
export async function GET(_request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const runArtifactDir = getAutomationReportRunDir(runId)

  try {
    const testRun = await getDownloadTestRun(runId)

    if (!testRun) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }

    const archive = createZipArchive()
    const hasFiles = await addDownloadArtifacts(archive, testRun, runArtifactDir)

    // If no files to add, return an error
    if (!hasFiles) {
      return NextResponse.json({ error: 'No run artifacts available for this test run' }, { status: 404 })
    }

    const zipBuffer = await finalizeArchive(archive)
    return createZipDownloadResponse(zipBuffer, runId)
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
