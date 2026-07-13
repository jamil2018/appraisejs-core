import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/config/db-config'
import archiver from 'archiver'
import { promises as fs } from 'fs'
import path from 'path'
import { getAutomationReportRunDir, resolveStoredPath } from '@/lib/automation/automation-path-roots'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { ServiceError } from '@/services/shared/errors'
import { opaqueArtifactError } from '@/app/api/test-runs/artifact-route-error'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project'

// Ensure this route runs in Node.js runtime (not Edge) for file system access
export const runtime = 'nodejs'

type Archive = ReturnType<typeof archiver>
type ArtifactFile = { absolutePath: string; archivePath: string }
type DownloadTestRun = NonNullable<Awaited<ReturnType<typeof getDownloadTestRun>>>

const MAX_CAPSULE_ARCHIVE_ENTRIES = 64
const MAX_CAPSULE_ARCHIVE_BYTES = 256 * 1024 * 1024

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
  projectRoot?: string,
): Promise<boolean> {
  try {
    const resolvedPath = resolveStoredPath(storedPath, projectRoot)
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

async function getDownloadTestRun(runId: string, targetProjectId: string) {
  return prisma.testRun.findFirst({
    where: { runId, targetProjectId },
    select: {
      runId: true,
      targetProjectId: true,
      runtimeCapsule: { select: { id: true } },
      logPath: true,
      reportPath: true,
      targetProject: {
        select: {
          canonicalPath: true,
        },
      },
      testCases: {
        select: {
          id: true,
          testCaseId: true,
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

  const projectRoot = testRun.targetProject?.canonicalPath
  const resolvedReportPath = resolveStoredPath(testRun.reportPath, projectRoot)
  if (isPathWithinDirectory(resolvedReportPath, runArtifactDir) || archivedPaths.has('cucumber.json')) {
    return false
  }

  const didAddReportFile = await addStoredArtifactFile(
    archive,
    testRun.reportPath,
    'cucumber.json',
    'Report file',
    projectRoot,
  )
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

  const projectRoot = testRun.targetProject?.canonicalPath
  const resolvedLogPath = resolveStoredPath(testRun.logPath, projectRoot)
  const archivePath = `logs/${path.basename(testRun.logPath)}`
  if (isPathWithinDirectory(resolvedLogPath, runArtifactDir) || archivedPaths.has(archivePath)) {
    return false
  }

  const didAddLogFile = await addStoredArtifactFile(archive, testRun.logPath, archivePath, 'Log file', projectRoot)
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
  const projectRoot = testRun.targetProject?.canonicalPath

  for (const tracePath of traceFiles) {
    const resolvedTracePath = resolveStoredPath(tracePath, projectRoot)
    const archivePath = `traces/${path.basename(tracePath)}`

    if (isPathWithinDirectory(resolvedTracePath, runArtifactDir) || archivedPaths.has(archivePath)) {
      continue
    }

    const didAddTraceFile = await addStoredArtifactFile(archive, tracePath, archivePath, 'Trace file', projectRoot)
    didAddAnyTraceFile = didAddTraceFile || didAddAnyTraceFile
    if (didAddTraceFile) {
      archivedPaths.add(archivePath)
    }
  }

  return didAddAnyTraceFile
}

async function addDownloadArtifacts(
  archive: Archive,
  testRun: DownloadTestRun,
  runArtifactDir: string,
  expectedTargetProjectId?: string,
) {
  if (testRun.runtimeCapsule) return addCapsuleDownloadArtifacts(archive, testRun, expectedTargetProjectId)
  const runArtifactFiles = await collectRunArtifactFiles(runArtifactDir)
  const archivedPaths = addRunArtifactFiles(archive, runArtifactFiles)
  const didAddReportFile = await addLegacyReportFile(archive, testRun, runArtifactDir, archivedPaths)
  const didAddLogFile = await addLegacyLogFile(archive, testRun, runArtifactDir, archivedPaths)
  const didAddTraceFile = await addLegacyTraceFiles(archive, testRun, runArtifactDir, archivedPaths)

  return runArtifactFiles.length > 0 || didAddReportFile || didAddLogFile || didAddTraceFile
}

async function addCapsuleDownloadArtifacts(
  archive: Archive,
  testRun: DownloadTestRun,
  expectedTargetProjectId?: string,
) {
  const access = new TestRunArtifactAccessService(prisma)
  let count = 0
  let totalBytes = 0
  const append = (bytes: Buffer, archivePath: string) => {
    if (count + 1 > MAX_CAPSULE_ARCHIVE_ENTRIES || totalBytes + bytes.length > MAX_CAPSULE_ARCHIVE_BYTES)
      throw new ServiceError('Capsule artifact archive exceeds its aggregate limit.', 'CONFLICT', 409)
    archive.append(bytes, { name: archivePath })
    count += 1
    totalBytes += bytes.length
  }
  for (const item of [
    { kind: 'report' as const, archivePath: 'cucumber.json' },
    { kind: 'log' as const, archivePath: 'logs/cucumber.log' },
  ]) {
    try {
      const artifact = await access.readBytes({ runId: testRun.runId, kind: item.kind, expectedTargetProjectId })
      append(artifact.bytes, item.archivePath)
    } catch (error) {
      if (!(error instanceof ServiceError) || error.statusCode !== 404) throw error
    }
  }
  for (const testCase of testRun.testCases) {
    if (!testCase.tracePath) continue
    const artifact = await access.readBytes({
      runId: testRun.runId,
      kind: 'trace',
      testCaseId: testCase.id,
      storedPath: testCase.tracePath,
      expectedTargetProjectId,
    })
    append(artifact.bytes, `traces/${testCase.testCaseId}.zip`)
  }
  return count > 0
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
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  try {
    const expectedTargetProjectId =
      request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? request.nextUrl.searchParams.get('targetProjectId')
    if (!expectedTargetProjectId) return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    const testRun = await getDownloadTestRun(runId, expectedTargetProjectId)

    if (!testRun) {
      return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    }
    const archive = createZipArchive()
    const runArtifactDir = getAutomationReportRunDir(runId, testRun.targetProject?.canonicalPath)
    const hasFiles = await addDownloadArtifacts(archive, testRun, runArtifactDir, expectedTargetProjectId)

    // If no files to add, return an error
    if (!hasFiles) {
      return NextResponse.json({ error: 'No run artifacts available for this test run' }, { status: 404 })
    }

    const zipBuffer = await finalizeArchive(archive)
    return createZipDownloadResponse(zipBuffer, runId)
  } catch (error) {
    return opaqueArtifactError(error)
  }
}
