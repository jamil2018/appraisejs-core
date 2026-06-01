import { promises as fs } from 'fs'

export const APPRAISE_METADATA_VERSION = 1
export const APPRAISE_METADATA_EXTENSION = '.appraise.json'

export type AppraiseTestCaseMetadataNode = {
  nodeId: string
  order: number
  label: string
}

export type AppraiseTestCaseMetadataFlowBlock = {
  id: string
  name: string
  order: number
  nodeIds: string[]
}

export type AppraiseTestCaseMetadataEntry = {
  identifierTag: string
  title: string
  description: string
  nodes: AppraiseTestCaseMetadataNode[]
  flowBlocks: AppraiseTestCaseMetadataFlowBlock[]
}

export type AppraiseTestCaseMetadata = {
  version: typeof APPRAISE_METADATA_VERSION
  testSuite: {
    name: string
    modulePath: string
  }
  testCases: AppraiseTestCaseMetadataEntry[]
}

export type AppraiseMetadataReadResult =
  | { metadata: AppraiseTestCaseMetadata | null; warnings: string[] }
  | { metadata: null; warnings: string[] }

type MetadataInputTestCase = {
  title: string
  description: string
  tags?: Array<{ tagExpression: string }>
  steps?: Array<{
    flowNodeId: string | null
    order: number
    label: string
  }>
  flowBlocks?: Array<{
    id: string
    name: string
    order: number
    nodes: Array<{ flowNodeId: string }>
  }>
}

export function getAppraiseMetadataPath(featureFilePath: string): string {
  return featureFilePath.replace(/\.feature$/, APPRAISE_METADATA_EXTENSION)
}

export function normalizeMetadataTag(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression : `@${tagExpression}`
}

export function findIdentifierTag(tags: Array<{ tagExpression: string } | string> = []): string | null {
  for (const tag of tags) {
    const tagExpression = typeof tag === 'string' ? tag : tag.tagExpression
    const normalized = normalizeMetadataTag(tagExpression)
    if (normalized.replace(/^@/, '').startsWith('tc_')) {
      return normalized
    }
  }

  return null
}

export function buildAppraiseMetadata(input: {
  testSuiteName: string
  modulePath: string
  testCases: MetadataInputTestCase[]
}): AppraiseTestCaseMetadata {
  return {
    version: APPRAISE_METADATA_VERSION,
    testSuite: {
      name: input.testSuiteName,
      modulePath: input.modulePath,
    },
    testCases: input.testCases.flatMap(testCase => {
      const identifierTag = findIdentifierTag(testCase.tags)
      if (!identifierTag) {
        return []
      }

      const nodes = (testCase.steps ?? [])
        .filter(step => step.flowNodeId)
        .map(step => ({
          nodeId: step.flowNodeId as string,
          order: step.order,
          label: step.label,
        }))

      const validNodeIds = new Set(nodes.map(node => node.nodeId))

      return [
        {
          identifierTag,
          title: testCase.title,
          description: testCase.description,
          nodes,
          flowBlocks: (testCase.flowBlocks ?? []).map(block => ({
            id: block.id,
            name: block.name,
            order: block.order,
            nodeIds: block.nodes.map(node => node.flowNodeId).filter(nodeId => validNodeIds.has(nodeId)),
          })),
        },
      ]
    }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateMetadata(value: unknown): AppraiseTestCaseMetadata {
  if (!isRecord(value) || value.version !== APPRAISE_METADATA_VERSION) {
    throw new Error(`Unsupported Appraise metadata version`)
  }

  if (!isRecord(value.testSuite) || !isString(value.testSuite.name) || !isString(value.testSuite.modulePath)) {
    throw new Error('Invalid Appraise metadata testSuite')
  }

  if (!Array.isArray(value.testCases)) {
    throw new Error('Invalid Appraise metadata testCases')
  }

  return {
    version: APPRAISE_METADATA_VERSION,
    testSuite: {
      name: value.testSuite.name,
      modulePath: value.testSuite.modulePath,
    },
    testCases: value.testCases.map((entry, index) => {
      if (!isRecord(entry) || !isString(entry.identifierTag) || !isString(entry.title)) {
        throw new Error(`Invalid Appraise metadata testCases[${index}]`)
      }

      if (!Array.isArray(entry.nodes) || !Array.isArray(entry.flowBlocks)) {
        throw new Error(`Invalid Appraise metadata arrays for ${entry.identifierTag}`)
      }

      return {
        identifierTag: normalizeMetadataTag(entry.identifierTag),
        title: entry.title,
        description: isString(entry.description) ? entry.description : '',
        nodes: entry.nodes.map((node, nodeIndex) => {
          if (!isRecord(node) || !isString(node.nodeId) || !isNumber(node.order) || !isString(node.label)) {
            throw new Error(`Invalid Appraise metadata node ${nodeIndex} for ${entry.identifierTag}`)
          }

          return {
            nodeId: node.nodeId,
            order: node.order,
            label: node.label,
          }
        }),
        flowBlocks: entry.flowBlocks.map((block, blockIndex) => {
          if (!isRecord(block) || !isString(block.id) || !isString(block.name) || !isNumber(block.order)) {
            throw new Error(`Invalid Appraise metadata flowBlock ${blockIndex} for ${entry.identifierTag}`)
          }

          if (!Array.isArray(block.nodeIds) || !block.nodeIds.every(isString)) {
            throw new Error(`Invalid Appraise metadata flowBlock nodeIds for ${entry.identifierTag}`)
          }

          return {
            id: block.id,
            name: block.name,
            order: block.order,
            nodeIds: block.nodeIds,
          }
        }),
      }
    }),
  }
}

export async function readAppraiseMetadataFile(metadataPath: string): Promise<AppraiseMetadataReadResult> {
  try {
    const content = await fs.readFile(metadataPath, 'utf-8')
    return {
      metadata: validateMetadata(JSON.parse(content)),
      warnings: [],
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { metadata: null, warnings: [] }
    }

    const message = error instanceof Error ? error.message : String(error)
    return {
      metadata: null,
      warnings: [`Unable to read Appraise metadata ${metadataPath}: ${message}`],
    }
  }
}

export function getMetadataByIdentifier(metadata: AppraiseTestCaseMetadata | null) {
  return new Map((metadata?.testCases ?? []).map(testCase => [testCase.identifierTag, testCase]))
}
