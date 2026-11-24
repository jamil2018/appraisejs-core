import type { WorkspaceRecordKind } from './workspace-records'

export type WorkspaceRequest = { kind: WorkspaceRecordKind; query: string }

export function parseAttachedCaseRename(body: string): string | undefined {
  const request = /^(?:please\s+)?rename (?:this|the attached) (?:test )?case to (.+)$/i.exec(body.trim())
  if (!request) return undefined
  const title = request[1].replace(/^(?:"(.*)"|“(.*)”)$/, '$1$2').trim()
  return title
}

const verb = /^(?:please\s+)?(?:find|show|list|open|search for|look up)\s+/i
const qualifier = /^(?:me\s+|my\s+|the\s+|recent\s+)+/i
const prefixes: ReadonlyArray<[RegExp, WorkspaceRecordKind]> = [
  [/^(?:test )?cases?\b/i, 'TEST_CASE'],
  [/^(?:test )?suites?\b/i, 'TEST_SUITE'],
  [/^(?:case )?templates?\b/i, 'CASE_TEMPLATE'],
  [/^(?:test )?runs?\b/i, 'TEST_RUN'],
  [/^reports?\b/i, 'REPORT'],
]

export function parseWorkspaceRequest(body: string): WorkspaceRequest | undefined {
  const request = body.trim().replace(/\?$/, '')
  if (!verb.test(request)) return undefined
  const subject = request.replace(verb, '').replace(qualifier, '')
  const entry = prefixes.find(([pattern]) => pattern.test(subject))
  if (!entry) return undefined
  const [pattern, kind] = entry
  const query = subject
    .replace(pattern, '')
    .trim()
    .replace(/^(?:for|about|matching|named|called)\s+/i, '')
    .replace(/^["“]|["”]$/g, '')
    .trim()
  if (query.length > 160) return undefined
  return { kind, query }
}
