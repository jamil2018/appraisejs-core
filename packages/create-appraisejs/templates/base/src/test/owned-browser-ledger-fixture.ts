type OwnedBrowserRow = {
  id: string
  journeyId: string
  targetProjectId: string
  processInstanceId: string
  sessionId: string
  generation: number
  status: string
  rowVersion: number
  cleanupHistoryJson: string
  stopReceiptJson?: string | null
  stopReceiptHash?: string | null
}

/** Synthetic persistence for browser-service tests; production uses Prisma. */
export function ownedBrowserLedgerFixture(ownedBrowsers = new Map<string, OwnedBrowserRow>()) {
  return {
    ownedBrowsers,
    qualityJourneyOwnedBrowser: {
      findMany: async ({
        where,
      }: {
        where: { journeyId: string; targetProjectId: string; status: { in: string[] } }
      }) =>
        [...ownedBrowsers.values()].filter(
          row =>
            row.journeyId === where.journeyId &&
            row.targetProjectId === where.targetProjectId &&
            where.status.in.includes(row.status),
        ),
      findUnique: async ({ where }: { where: { id: string } }) => ownedBrowsers.get(where.id) ?? null,
      create: async ({ data }: { data: Omit<OwnedBrowserRow, 'rowVersion'> }) => {
        if (ownedBrowsers.has(data.id)) throw new Error('duplicate browser ownership')
        const row = { ...data, rowVersion: 0 }
        ownedBrowsers.set(row.id, row)
        return row
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string
          journeyId: string
          targetProjectId: string
          processInstanceId: string
          rowVersion: number
          status: string
        }
        data: {
          status: string
          rowVersion: { increment: number }
          cleanupHistoryJson: string
          stopReceiptJson?: string
          stopReceiptHash?: string
        }
      }) => {
        const row = ownedBrowsers.get(where.id)
        if (
          !row ||
          row.journeyId !== where.journeyId ||
          row.targetProjectId !== where.targetProjectId ||
          row.processInstanceId !== where.processInstanceId ||
          row.rowVersion !== where.rowVersion ||
          row.status !== where.status
        )
          return { count: 0 }
        ownedBrowsers.set(row.id, { ...row, ...data, rowVersion: row.rowVersion + data.rowVersion.increment })
        return { count: 1 }
      },
    },
  }
}

export type { OwnedBrowserRow }
