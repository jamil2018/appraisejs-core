import { NextRequest, NextResponse } from 'next/server'
import archiver from 'archiver'
import prisma from '@/config/db-config'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { ServiceError } from '@/services/shared/errors'
import { opaqueArtifactError } from '@/app/api/test-runs/artifact-route-error'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project'

export const runtime = 'nodejs'

type Archive = ReturnType<typeof archiver>
const MAX_CAPSULE_ARCHIVE_ENTRIES = 64
const MAX_CAPSULE_ARCHIVE_BYTES = 256 * 1024 * 1024

async function getDownloadTestRun(runId: string, targetProjectId: string) {
  return prisma.testRun.findFirst({
    where: { runId, targetProjectId },
    select: {
      runId: true,
      targetProjectId: true,
      testCases: { select: { id: true, testCaseId: true, tracePath: true } },
    },
  })
}

function createZipArchive() {
  return archiver('zip', { zlib: { level: 9 } })
}

async function addCapsuleDownloadArtifacts(
  archive: Archive,
  testRun: NonNullable<Awaited<ReturnType<typeof getDownloadTestRun>>>,
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
      const artifact = await access.readBytes({
        runId: testRun.runId,
        kind: item.kind,
        expectedTargetProjectId: testRun.targetProjectId,
      })
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
      expectedTargetProjectId: testRun.targetProjectId,
    })
    append(artifact.bytes, `traces/${testCase.testCaseId}.zip`)
  }
  return count > 0
}

function finalizeArchive(archive: Archive) {
  const chunks: Buffer[] = []
  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })
  archive.finalize()
  return archivePromise
}

function createZipDownloadResponse(zipBuffer: Buffer, runId: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="test-run-${runId}-${timestamp}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  })
}

/** Downloads only artifacts sealed by the TestRun's runtime capsule. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  try {
    const targetProjectId =
      request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? request.nextUrl.searchParams.get('targetProjectId')
    if (!targetProjectId) return NextResponse.json({ error: 'Test run not found' }, { status: 404 })
    const testRun = await getDownloadTestRun(runId, targetProjectId)
    if (!testRun) return NextResponse.json({ error: 'Test run not found' }, { status: 404 })

    const archive = createZipArchive()
    if (!(await addCapsuleDownloadArtifacts(archive, testRun)))
      return NextResponse.json({ error: 'No run artifacts available for this test run' }, { status: 404 })
    return createZipDownloadResponse(await finalizeArchive(archive), runId)
  } catch (error) {
    return opaqueArtifactError(error)
  }
}
