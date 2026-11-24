import prisma from '@/config/db-config'
import {
  journeyRecordLabels,
  type JourneyRecordContext,
  type JourneyRecordReference,
} from '@/lib/quality-journey/record-context'

type Scope = { targetProjectId: string; id: string }

const recordTitles = {
  'test-case': async (scope: Scope) =>
    (
      await prisma.testCase.findFirst({
        where: { ...scope, archivedAt: null },
        select: { title: true },
      })
    )?.title,
  'test-run': async (scope: Scope) => (await prisma.testRun.findFirst({ where: scope, select: { name: true } }))?.name,
  report: async (scope: Scope) =>
    (
      await prisma.report.findFirst({
        where: { ...scope, testRun: { targetProjectId: scope.targetProjectId } },
        select: { name: true },
      })
    )?.name,
}

export async function loadJourneyRecordContext(
  projectId: string,
  reference: JourneyRecordReference,
): Promise<JourneyRecordContext | undefined> {
  const name = await recordTitles[reference.kind]({ id: reference.id, targetProjectId: projectId })
  if (name === undefined) return undefined
  return {
    ...reference,
    source: 'appraise.record/v1',
    title: name.trim().slice(0, 512) || journeyRecordLabels[reference.kind],
  }
}
