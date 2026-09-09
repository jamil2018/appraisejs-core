import { canonicalJson, collaborationHash } from './canonical'
import {
  collaborationManifestSchema,
  collaborationRecordSchema,
  type CollaborationManifest,
  type CollaborationRecord,
} from './contracts'
import { recordKey, validateCollaborationGraph } from './graph'

const directoryByKind: Record<CollaborationRecord['kind'], string> = {
  module: 'modules',
  'test-suite': 'test-suites',
  'test-case': 'test-cases',
  template: 'templates',
  'locator-group': 'locator-groups',
  locator: 'locators',
  tag: 'tags',
  'environment-reference': 'environment-references',
  'journey-reuse-asset': 'journey-reuse-assets',
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function normalizeCollaborationRecord(record: CollaborationRecord): CollaborationRecord {
  const parsed = collaborationRecordSchema.parse(record)
  switch (parsed.kind) {
    case 'test-suite':
      return {
        ...parsed,
        payload: {
          ...parsed.payload,
          testCasePortableIds: uniqueSorted(parsed.payload.testCasePortableIds),
          tagPortableIds: uniqueSorted(parsed.payload.tagPortableIds),
        },
      }
    case 'test-case':
      return {
        ...parsed,
        payload: {
          ...parsed.payload,
          steps: [...parsed.payload.steps].sort((left, right) => left.order - right.order),
          flowBlocks: [...parsed.payload.flowBlocks].sort((left, right) => left.order - right.order),
          tagPortableIds: uniqueSorted(parsed.payload.tagPortableIds),
        },
      }
    case 'template':
      return {
        ...parsed,
        payload: {
          ...parsed.payload,
          steps: [...parsed.payload.steps].sort((left, right) => left.order - right.order),
          flowBlocks: [...parsed.payload.flowBlocks].sort((left, right) => left.order - right.order),
        },
      }
    default:
      return parsed
  }
}

export interface CollaborationSnapshotFiles {
  manifest: CollaborationManifest
  files: Map<string, string>
  snapshotHash: string
}

export function buildCollaborationSnapshotFiles(
  records: CollaborationRecord[],
  emptyPortableProjectId?: string,
): CollaborationSnapshotFiles {
  const normalized = records.map(normalizeCollaborationRecord)
  const { ordered } = validateCollaborationGraph(normalized)
  const projectIds = new Set(ordered.map(record => record.portableProjectId))
  if (projectIds.size > 1) throw new Error('A collaboration snapshot must contain exactly one portable project')
  const portableProjectId = ordered[0]?.portableProjectId ?? emptyPortableProjectId
  if (!portableProjectId) throw new Error('An empty collaboration snapshot requires a portable project identity')

  const files = new Map<string, string>()
  const entries = ordered.map(record => {
    const path = `${directoryByKind[record.kind]}/${record.portableId}.json`
    const bytes = canonicalJson(record)
    files.set(path, bytes)
    return { kind: record.kind, portableId: record.portableId, path, hash: collaborationHash(bytes) }
  })
  const manifest = collaborationManifestSchema.parse({
    format: 'appraise.repository-collaboration/v1',
    portableProjectId,
    records: entries,
  })
  files.set('manifest.json', canonicalJson(manifest))
  return { manifest, files, snapshotHash: collaborationHash({ manifest, records: ordered }) }
}

export interface AdoptionCollision {
  recordKey: string
  localEntityId: string
  reason: 'NAME_COLLISION_WITHOUT_BASELINE'
}

export function validateFirstAdoption(
  records: CollaborationRecord[],
  localNames: Map<CollaborationRecord['kind'], Map<string, string>>,
  existingMappings: Set<string>,
): AdoptionCollision[] {
  const collisions: AdoptionCollision[] = []
  for (const record of records) {
    if (record.archived || existingMappings.has(recordKey(record))) continue
    const payload = record.payload as { name?: string; title?: string }
    const name = payload.name ?? payload.title
    const localEntityId = name ? localNames.get(record.kind)?.get(name) : undefined
    if (localEntityId) {
      collisions.push({ recordKey: recordKey(record), localEntityId, reason: 'NAME_COLLISION_WITHOUT_BASELINE' })
    }
  }
  return collisions
}
