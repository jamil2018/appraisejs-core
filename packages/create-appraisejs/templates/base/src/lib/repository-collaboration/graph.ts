import type { CollaborationRecord } from './contracts'

export interface CollaborationGraphValidation {
  ordered: CollaborationRecord[]
  keys: Set<string>
}

export function recordKey(record: Pick<CollaborationRecord, 'kind' | 'portableId'>): string {
  return `${record.kind}:${record.portableId}`
}

function requiredReferences(
  record: CollaborationRecord,
): ReadonlyArray<readonly [CollaborationRecord['kind'], string]> {
  if (record.archived) return []
  switch (record.kind) {
    case 'module':
      return record.payload.parentPortableId ? [['module', record.payload.parentPortableId]] : []
    case 'test-suite':
      return [
        ['module', record.payload.modulePortableId],
        ...record.payload.testCasePortableIds.map(id => ['test-case', id] as const),
        ...record.payload.tagPortableIds.map(id => ['tag', id] as const),
      ]
    case 'test-case':
      return record.payload.tagPortableIds.map(id => ['tag', id])
    case 'locator-group':
      return [['module', record.payload.modulePortableId]]
    case 'locator':
      return [['locator-group', record.payload.locatorGroupPortableId]]
    default:
      return []
  }
}

export function validateCollaborationGraph(records: CollaborationRecord[]): CollaborationGraphValidation {
  const byKey = new Map(records.map(record => [recordKey(record), record]))
  if (byKey.size !== records.length) throw new Error('Duplicate collaboration record identity')

  for (const record of records) {
    for (const [kind, portableId] of requiredReferences(record)) {
      const dependency = byKey.get(`${kind}:${portableId}`)
      if (!dependency || dependency.archived) throw new Error(`Missing active dependency ${kind}:${portableId}`)
    }
  }

  const modules = new Map(
    records
      .filter(
        (record): record is Extract<CollaborationRecord, { kind: 'module' }> =>
          record.kind === 'module' && !record.archived,
      )
      .map(record => [record.portableId, record]),
  )
  for (const moduleRecord of modules.values()) {
    const visited = new Set<string>([moduleRecord.portableId])
    let parentId = moduleRecord.payload.parentPortableId
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`Module cycle includes ${parentId}`)
      visited.add(parentId)
      parentId = modules.get(parentId)?.payload.parentPortableId ?? null
    }
  }

  const rank: Record<CollaborationRecord['kind'], number> = {
    module: 0,
    tag: 1,
    'environment-reference': 2,
    'locator-group': 3,
    locator: 4,
    'test-case': 5,
    template: 6,
    'test-suite': 7,
    'journey-reuse-asset': 8,
  }
  return {
    ordered: [...records].sort(
      (left, right) => rank[left.kind] - rank[right.kind] || left.portableId.localeCompare(right.portableId),
    ),
    keys: new Set(byKey.keys()),
  }
}

export function allocateLocalGraphIds(
  records: CollaborationRecord[],
  allocate: (record: CollaborationRecord) => string,
): Map<string, string> {
  const { ordered } = validateCollaborationGraph(records)
  return new Map(ordered.map(record => [recordKey(record), allocate(record)]))
}
