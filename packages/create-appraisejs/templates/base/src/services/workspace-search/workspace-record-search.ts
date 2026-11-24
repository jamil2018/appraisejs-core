import prisma from '@/config/db-config'
import type { WorkspaceRequest } from '@/lib/conversation/workspace-request'
import { workspaceRecordPlural, type WorkspaceRecord } from '@/lib/conversation/workspace-records'

const orderBy = [{ updatedAt: 'desc' }, { id: 'asc' }] as const
const namedRecord = { id: true, name: true } as const
const options = { orderBy: [...orderBy], take: 8 }

const readers = {
  TEST_CASE: async (targetProjectId: string, query: string) => {
    const rows = await prisma.testCase.findMany({
      ...options,
      where: { targetProjectId, archivedAt: null, title: { contains: query } },
      select: { id: true, title: true },
    })
    return rows.map(row => ({ id: row.id, name: row.title }))
  },
  TEST_SUITE: (targetProjectId: string, query: string) =>
    prisma.testSuite.findMany({
      ...options,
      where: { targetProjectId, archivedAt: null, name: { contains: query } },
      select: namedRecord,
    }),
  CASE_TEMPLATE: (targetProjectId: string, query: string) =>
    prisma.templateTestCase.findMany({
      ...options,
      where: { targetProjectId, archivedAt: null, name: { contains: query } },
      select: namedRecord,
    }),
  TEST_RUN: (targetProjectId: string, query: string) =>
    prisma.testRun.findMany({ ...options, where: { targetProjectId, name: { contains: query } }, select: namedRecord }),
  REPORT: (targetProjectId: string, query: string) =>
    prisma.report.findMany({
      ...options,
      where: { targetProjectId, testRun: { targetProjectId }, name: { contains: query } },
      select: namedRecord,
    }),
}

export async function searchWorkspaceRecords(targetProjectId: string, { kind, query }: WorkspaceRequest) {
  const matches = await readers[kind](targetProjectId, query)
  return matches.map((row): WorkspaceRecord => ({
    kind,
    id: row.id,
    title: row.name.trim().slice(0, 512) || 'Untitled record',
  }))
}

export async function answerWorkspaceRequest(targetProjectId: string, request: WorkspaceRequest) {
  const records = await searchWorkspaceRecords(targetProjectId, request)
  const name = workspaceRecordPlural(request.kind)
  const suffix = request.query ? ` matching “${request.query}”` : ''
  const content = records.length
    ? `Found ${records.length === options.take ? 'the 8 most recent' : records.length} ${name}${suffix} in this project.`
    : `No ${name}${suffix} in this project.`
  return { content, records }
}
