import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/config/db-config'
import { readRuntimeCapsuleDiagnostic } from '@/services/test-run/runtime-capsule-diagnostics-service'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const nextRequest = new NextRequest(request)
  const targetProjectId =
    nextRequest.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? nextRequest.nextUrl.searchParams.get('targetProjectId')
  if (!targetProjectId)
    return NextResponse.json({ error: 'Managed runtime capsule diagnostic was not found.' }, { status: 404 })
  const run = await prisma.testRun.findFirst({
    where: { runId, targetProjectId },
    select: { targetProjectId: true, runtimeCapsule: { select: { id: true } } },
  })
  if (!run?.runtimeCapsule)
    return NextResponse.json({ error: 'Managed runtime capsule diagnostic was not found.' }, { status: 404 })
  try {
    return NextResponse.json(await readRuntimeCapsuleDiagnostic({ runId, expectedTargetProjectId: targetProjectId }), {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    const missing = error instanceof Error && error.message === 'Managed runtime capsule diagnostic was not found.'
    return NextResponse.json(
      {
        error: missing
          ? 'Managed runtime capsule diagnostic was not found.'
          : 'Managed runtime capsule diagnostic is corrupt.',
      },
      { status: missing ? 404 : 409 },
    )
  }
}
