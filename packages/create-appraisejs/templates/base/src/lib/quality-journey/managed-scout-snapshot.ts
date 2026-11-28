import { hashCanonical } from './analysis-contracts'

export function managedScoutSnapshotId(discoveryRevisionId: string) {
  return `managed-pages:${hashCanonical(discoveryRevisionId).slice(7)}`
}

export type ScoutReceiptReference = {
  artifactId: string
  contentHash: string
  snapshotId: string
  capturedAt: string
}

/** The existing snapshot envelope commits to either one receipt or a reviewed page set. */
export function reviewedScoutSnapshot(receipts: readonly ScoutReceiptReference[]) {
  const first = receipts[0]
  if (!first || receipts.some(receipt => receipt.snapshotId !== first.snapshotId))
    throw new Error('Scout evidence must share the reviewed snapshot identity.')
  const members = receipts
    .map(({ artifactId, capturedAt, contentHash }) => ({ artifactId, capturedAt, contentHash }))
    .sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
  return {
    snapshotId: first.snapshotId,
    capturedAt: members.reduce(
      (latest, member) => (member.capturedAt > latest ? member.capturedAt : latest),
      first.capturedAt,
    ),
    contentHash: members.length === 1 ? first.contentHash : hashCanonical(members),
  }
}
