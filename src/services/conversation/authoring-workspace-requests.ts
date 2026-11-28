import type { ConversationRecord } from './conversation-service'
import { z } from 'zod'
import { parseWorkspaceRequest } from '@/lib/conversation/workspace-request'
import { coordinatorStepDefinitionService } from '@/services/coordinator/coordinator-step-definition-service'
import { listModules } from '@/services/module/module-service'
import { listFilterTags } from '@/services/tag/tag-service'
import { answerWorkspaceRequest } from '@/services/workspace-search/workspace-record-search'

type AuthoringKind = 'MODULE' | 'TAG'
type AuthoringRequest = { kind: AuthoringKind; query: string }

const lookupVerb = /^(?:please\s+)?(?:find|show|list|search for|look up)\s+/i
const subject = /^(?:(?:me|my|the|recent)\s+)*(modules?|tags?)\b/i
const readySearch = /^(?:please\s+)?find\s+ready\s+step\s+definitions\s+for\s+(.+?)\??$/i
const readyResultSchema = z
  .object({
    matches: z
      .array(
        z
          .object({
            step: z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(40) }),
            title: z.string().min(1),
            hashes: z.object({ definition: z.string().regex(/^sha256:[a-f0-9]{64}$/) }),
          })
          .passthrough(),
      )
      .max(25),
  })
  .passthrough()

function parseReadyStepSearch(content: string) {
  const match = readySearch.exec(content.trim())
  if (!match) return undefined
  const query = match[1]!
    .trim()
    .replace(/^(?:"(.*)"|“(.*)”)$/, '$1$2')
    .trim()
  return query && query.length <= 200 ? query : undefined
}

async function answerReadyStepSearch(query: string) {
  const search = new URLSearchParams({ query, limit: '8', surface: 'human' })
  const body = (await coordinatorStepDefinitionService.read(['step-definitions', 'search'], search)).body
  const result = readyResultSchema.parse(body)
  const seen = new Set<string>()
  const records: ConversationRecord[] = []
  for (const match of result.matches) {
    const { id, version } = match.step
    if (seen.has(id) || !match.title.trim() || !/^[\x20-\x7e]{1,200}$/.test(id) || !/^[\x21-\x7e]{1,40}$/.test(version))
      continue
    seen.add(id)
    records.push({
      kind: 'STEP_DEFINITION',
      id,
      title: Array.from(match.title.trim()).slice(0, 256).join(''),
      stepReference: { version, definitionHash: match.hashes.definition },
    })
  }
  return {
    content: records.length
      ? `Found ${records.length} ready step definition${records.length === 1 ? '' : 's'}. Open a result to review its exact published version.`
      : 'No ready step definitions matched this request.',
    records,
  }
}

const creations = {
  'test case': 'TEST_CASE',
  'test suite': 'TEST_SUITE',
  'case template': 'CASE_TEMPLATE',
  module: 'MODULE',
  tag: 'TAG',
  'step definition': 'STEP_DEFINITION',
} as const

function parseAuthoringContinuation(content: string) {
  const match =
    /^(?:please\s+)?(create|add|edit|open)\s+(?:(?:a|an|the|new)\s+)*(test case|test suite|case template|step definition|module|tag)\b(?:\s+(.*?))?[.!?]?$/i.exec(
      content.trim(),
    )
  if (!match) return undefined
  const verb = match[1]!.toLowerCase()
  const label = match[2]!.toLowerCase() as keyof typeof creations
  return { create: verb === 'create' || verb === 'add', label, query: match[3]?.trim() ?? '' }
}

export function parseAuthoringWorkspaceRequest(content: string): AuthoringRequest | undefined {
  const request = content.trim().replace(/\?$/, '')
  if (!lookupVerb.test(request)) return undefined
  const item = subject.exec(request.replace(lookupVerb, ''))
  if (!item) return undefined
  const kind: AuthoringKind = /^modules?/i.test(item[1]) ? 'MODULE' : 'TAG'
  const query = request
    .replace(lookupVerb, '')
    .replace(subject, '')
    .trim()
    .replace(/^(?:for|about|matching|named|called)\s+/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim()
  if (query.length > 160) return undefined
  return { kind, query }
}

export async function answerAuthoringWorkspaceRequest(input: {
  targetProjectId: string
  content: string
}): Promise<{ content: string; records: readonly ConversationRecord[] } | undefined> {
  const readyQuery = parseReadyStepSearch(input.content)
  if (readyQuery) return answerReadyStepSearch(readyQuery)
  const continuation = parseAuthoringContinuation(input.content)
  if (continuation?.create) {
    return {
      content: `Open the ${continuation.label} editor to enter the details and save to this project.`,
      records: [
        {
          kind: creations[continuation.label],
          id: input.targetProjectId,
          title: `New ${continuation.label}`,
          destination: 'create',
        },
      ],
    }
  }
  if (continuation?.label === 'step definition')
    return {
      content: 'Open Step definitions to choose the exact definition and review its current draft.',
      records: [{ kind: 'STEP_DEFINITION', id: input.targetProjectId, title: 'Open step definitions' }],
    }
  const lookup = continuation ? `Find ${continuation.label}s ${continuation.query}` : input.content
  if (continuation && !['module', 'tag'].includes(continuation.label)) {
    const request = parseWorkspaceRequest(lookup)
    return request ? answerWorkspaceRequest(input.targetProjectId, request) : undefined
  }
  const request = parseAuthoringWorkspaceRequest(lookup)
  if (!request) return undefined
  const rows =
    request.kind === 'MODULE' ? await listModules(input.targetProjectId) : await listFilterTags(input.targetProjectId)
  const query = request.query.toLocaleLowerCase()
  const matches = rows
    .filter(row => row.name.toLocaleLowerCase().includes(query))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .slice(0, 8)
  const records: ConversationRecord[] = matches.map(row => ({ kind: request.kind, id: row.id, title: row.name }))
  const label = request.kind === 'MODULE' ? 'module' : 'tag'
  return {
    content: records.length
      ? `Found ${records.length} matching ${label}${records.length === 1 ? '' : 's'} in this project.`
      : `No matching ${label}s found in this project.`,
    records,
  }
}
