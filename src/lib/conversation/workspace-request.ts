import type { WorkspaceRecordKind } from './workspace-records'

export type WorkspaceRequest = { kind: WorkspaceRecordKind; query: string }

export const chatApprovalText = 'Approve criteria'
export const chatComposerFormId = 'conversation-composer'

export type RunPermissionReview = { journeyId: string; executionConsentId: string; expectedScopeHash: string }

export function isRunPermissionApprovalRequest(text: string): boolean {
  return /^allow and run these tests[.!]?$/i.test(text.trim())
}

export function isJourneyEvidenceRequest(text: string): boolean {
  return /^(?:please\s+)?show me where[.!?]?$/i.test(text.trim())
}

export function isAnalysisApprovalRequest(text: string): boolean {
  return /^(?:i\s+)?approve(?:\s+(?:criteria|(?:this|the)\s+(?:review|revision|criteria)))?[.!]?$/i.test(text.trim())
}

export function parseAnalysisAnswerReply(text: string): string | undefined {
  return /^answer:\s*([\s\S]+)$/i.exec(text.trim())?.[1]?.trim() || undefined
}

export function isCheckoutOrderNumberRequest(text: string): boolean {
  return /^(?:please\s+)?(?:also\s+)?(?:check|verify)\s+that\s+(?:i\s+(?:get|receive)|(?:the\s+)?(?:order\s+)?confirmation\s+(?:shows|includes))\s+(?:an?|the)\s+order\s+(?:number|id)[.!?]?$/i.test(
    text.trim(),
  )
}

export function parseAttachedCaseRename(body: string): string | undefined {
  const request = /^(?:please\s+)?rename (?:this|the attached) (?:test )?case to (.+)$/i.exec(body.trim())
  if (!request) return undefined
  const title = request[1].replace(/^(?:"(.*)"|“(.*)”)$/, '$1$2').trim()
  return title
}

/** Add only the attached case to one suite in one explicitly named module. */
export function parseAttachedCaseSuiteAdd(body: string): { suiteName: string; moduleName: string } | undefined {
  const match =
    /^(?:please\s+)?add\s+(?:this|the attached)\s+(?:test\s+)?case\s+to\s+(?:test\s+)?suite\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const suiteName = match[1] ?? match[2] ?? ''
  const moduleName = match[3] ?? match[4] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    suiteName.length < 3 ||
    suiteName.length > 160 ||
    !label.test(suiteName) ||
    !moduleName ||
    moduleName.length > 160 ||
    !label.test(moduleName)
  )
    return undefined
  return { suiteName, moduleName }
}

export function isNamedCasesSuiteAddRequest(body: string): boolean {
  return /^(?:please\s+)?add\s+cases\b/i.test(body.trim())
}

/** Require 2–8 distinct quoted case titles and one exact suite/module pair. */
export function parseNamedCasesSuiteAdd(
  body: string,
): { caseTitles: string[]; suiteName: string; moduleName: string } | undefined {
  const match =
    /^(?:please\s+)?add\s+cases\s+(.+?)\s+to\s+(?:test\s+)?suite\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const rawTitles = match[1]!.trim()
  const item = /(?:^|,\s*)(?:"([^"\r\n]+)"|“([^”\r\n]+)”)/gy
  const caseTitles: string[] = []
  let offset = 0
  while (offset < rawTitles.length) {
    item.lastIndex = offset
    const next = item.exec(rawTitles)
    if (!next) return undefined
    const title = next[1] ?? next[2] ?? ''
    if (title.trim().length < 3 || title.length > 512) return undefined
    caseTitles.push(title)
    if (caseTitles.length > 8) return undefined
    offset = item.lastIndex
  }
  const suiteName = match[2] ?? match[3] ?? ''
  const moduleName = match[4] ?? match[5] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    caseTitles.length < 2 ||
    new Set(caseTitles).size !== caseTitles.length ||
    suiteName.length < 3 ||
    suiteName.length > 160 ||
    !label.test(suiteName) ||
    !moduleName ||
    moduleName.length > 160 ||
    !label.test(moduleName)
  )
    return undefined
  return { caseTitles, suiteName, moduleName }
}

/** Recognize only a single, explicit request for a root module. */
export function parseRootModuleCreate(body: string): string | undefined {
  const request = body.trim()
  const match = /^(?:please\s+)?(?:add\s+an?\s+(.+?)\s+module|create\s+(?:a\s+)?module\s+named\s+(.+?))[.!]?$/i.exec(
    request,
  )
  if (!match) return undefined
  const candidate = (match[1] ?? match[2]).trim()
  const quoted = /^(?:"(.*)"|“(.*)”)$/.exec(candidate)
  const name = (quoted?.[1] ?? quoted?.[2] ?? candidate).trim()
  if (!name || name.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u.test(name)) return undefined
  if (!quoted && /\s/.test(name)) return undefined
  return name
}

export type ExactModuleRename = {
  currentName: string
  nextName: string
  scope: 'UNIQUE' | 'ROOT' | 'PARENT'
  parentName?: string
}

/** Require a quoted source name, and an exact parent when a duplicate module name needs one. */
export function parseExactModuleRename(body: string): ExactModuleRename | undefined {
  const text = body.trim()
  const quoted = '(?:"([^"\\r\\n]+)"|“([^”\\r\\n]+)”)'
  const root = new RegExp(`^(?:please\\s+)?rename\\s+root\\s+module\\s+${quoted}\\s+to\\s+${quoted}[.!]?$`, 'i').exec(
    text,
  )
  const child = root
    ? null
    : new RegExp(
        `^(?:please\\s+)?rename\\s+module\\s+${quoted}\\s+under\\s+parent\\s+module\\s+${quoted}\\s+to\\s+${quoted}[.!]?$`,
        'i',
      ).exec(text)
  const unique =
    root || child
      ? null
      : new RegExp(`^(?:please\\s+)?rename\\s+module\\s+${quoted}\\s+to\\s+${quoted}[.!]?$`, 'i').exec(text)
  if (!root && !child && !unique) return undefined
  const currentName = root?.[1] ?? root?.[2] ?? child?.[1] ?? child?.[2] ?? unique?.[1] ?? unique?.[2] ?? ''
  const parentName = child ? (child[3] ?? child[4] ?? '') : undefined
  const nextName = root?.[3] ?? root?.[4] ?? child?.[5] ?? child?.[6] ?? unique?.[3] ?? unique?.[4] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    !currentName ||
    currentName.length > 160 ||
    !label.test(currentName) ||
    !nextName ||
    nextName.length > 160 ||
    !label.test(nextName) ||
    nextName === currentName ||
    (parentName !== undefined && (!parentName || parentName.length > 160 || !label.test(parentName)))
  )
    return undefined
  return {
    currentName,
    nextName,
    scope: root ? 'ROOT' : child ? 'PARENT' : 'UNIQUE',
    ...(parentName ? { parentName } : {}),
  }
}

/** Require both tag fields; a label alone cannot safely supply a Gherkin expression. */
export function parseExactTagCreate(body: string): { name: string; tagExpression: string } | undefined {
  const match =
    /^(?:please\s+)?(?:create|add)\s+a\s+tag\s+named\s+(.+?)\s+with\s+expression\s+(@[A-Za-z0-9_-]+)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const raw = match[1]!.trim()
  const quoted = /^(?:"(.*)"|“(.*)”)$/u.exec(raw)
  const name = (quoted?.[1] ?? quoted?.[2] ?? raw).trim()
  if (!name || name.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u.test(name)) return undefined
  if (!quoted && /\s/u.test(name)) return undefined
  return { name, tagExpression: match[2]! }
}

/** Rename a filter tag with both current fields supplied; leave its expression and relationships intact. */
export function parseExactTagRename(
  body: string,
): { currentName: string; tagExpression: string; nextName: string } | undefined {
  const match =
    /^(?:please\s+)?rename\s+(?:filter\s+)?tag\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+with\s+expression\s+(@[A-Za-z0-9_-]+)\s+to\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const currentName = match[1] ?? match[2] ?? ''
  const tagExpression = match[3]!
  const nextName = match[4] ?? match[5] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    !currentName ||
    currentName.length > 160 ||
    !label.test(currentName) ||
    !nextName ||
    nextName.length > 160 ||
    !label.test(nextName) ||
    currentName === nextName
  )
    return undefined
  return { currentName, tagExpression, nextName }
}

const suiteCreateRequest = /^(?:please\s+)?create\s+a\s+(?:test\s+)?suite\s+named\b/i

const caseFromTemplateRequest = /^(?:please\s+)?create\s+(?:a\s+)?test\s+case\b[\s\S]*\bfrom\s+template\b/i

export function isCaseFromTemplateRequest(body: string): boolean {
  return caseFromTemplateRequest.test(body.trim())
}

/** A quoted title and exact template name; the template supplies every step without further choices. */
export function parseExactCaseFromTemplate(body: string): { title: string; templateName: string } | undefined {
  const match =
    /^(?:please\s+)?create\s+(?:a\s+)?test\s+case\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+from\s+template\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const title = match[1] ?? match[2] ?? ''
  const templateName = match[3] ?? match[4] ?? ''
  if (
    title.trim().length < 3 ||
    title.length > 512 ||
    Buffer.byteLength(title, 'utf8') > 2_048 ||
    !templateName.trim() ||
    templateName.length > 160 ||
    Buffer.byteLength(templateName, 'utf8') > 640
  )
    return undefined
  return { title, templateName }
}

export function isSuiteCreateRequest(body: string): boolean {
  return suiteCreateRequest.test(body.trim())
}

/** Bind a suite to one named module in the current project; names with spaces must be quoted. */
export function parseExactSuiteCreate(body: string): { name: string; moduleName: string } | undefined {
  const match =
    /^(?:please\s+)?create\s+a\s+(?:test\s+)?suite\s+named\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const name = (match[1] ?? match[2] ?? '').trim()
  const moduleName = match[3] ?? match[4] ?? ''
  if (name.length < 3 || name.length > 160 || !moduleName || moduleName.length > 160) return undefined
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (!label.test(name) || !label.test(moduleName)) return undefined
  return { name, moduleName }
}

/** Rename one uniquely identified active suite without changing its other fields. */
export function parseExactSuiteRename(
  body: string,
): { currentName: string; moduleName: string; nextName: string } | undefined {
  const match =
    /^(?:please\s+)?rename\s+(?:test\s+)?suite\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+to\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const currentName = match[1] ?? match[2] ?? ''
  const moduleName = match[3] ?? match[4] ?? ''
  const nextName = match[5] ?? match[6] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    currentName.length < 3 ||
    currentName.length > 160 ||
    !label.test(currentName) ||
    !moduleName ||
    moduleName.length > 160 ||
    !label.test(moduleName) ||
    nextName.length < 3 ||
    nextName.length > 160 ||
    !label.test(nextName) ||
    nextName === currentName
  )
    return undefined
  return { currentName, moduleName, nextName }
}

/** Create one empty locator group at one literal project route, without browser access. */
export function parseExactLocatorGroupCreate(
  body: string,
): { name: string; moduleName: string; route: string } | undefined {
  const match =
    /^(?:please\s+)?create\s+(?:a\s+)?locator\s+group\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+for\s+route\s+(?:"(\/[^"\r\n]*)"|“(\/[^”\r\n]*)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const name = (match[1] ?? match[2] ?? '').trim()
  const moduleName = match[3] ?? match[4] ?? ''
  const route = match[5] ?? match[6] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    !name ||
    name.length > 160 ||
    !label.test(name) ||
    !moduleName ||
    moduleName.length > 160 ||
    !label.test(moduleName) ||
    route.length > 256 ||
    !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(route)
  )
    return undefined
  return { name, moduleName, route }
}

/** Rename one group at its displayed module and literal route without changing its membership. */
export function parseExactLocatorGroupRename(
  body: string,
): { currentName: string; moduleName: string; route: string; nextName: string } | undefined {
  const match =
    /^(?:please\s+)?rename\s+locator\s+group\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+in\s+module\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+for\s+route\s+(?:"(\/[^"\r\n]*)"|“(\/[^”\r\n]*)”)\s+to\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const currentName = match[1] ?? match[2] ?? ''
  const moduleName = match[3] ?? match[4] ?? ''
  const route = match[5] ?? match[6] ?? ''
  const nextName = match[7] ?? match[8] ?? ''
  const label = /^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u
  if (
    !currentName ||
    currentName.length > 160 ||
    !label.test(currentName) ||
    !moduleName ||
    moduleName.length > 160 ||
    !label.test(moduleName) ||
    !nextName ||
    nextName.length > 160 ||
    !label.test(nextName) ||
    nextName === currentName ||
    route.length > 256 ||
    !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(route)
  )
    return undefined
  return { currentName, moduleName, route, nextName }
}

export function isProjectSwitchRequest(body: string): boolean {
  return /^(?:please\s+)?switch\s+to\s+project\b/i.test(body.trim())
}

/** Require one quoted, exact registered project display name. */
export function parseExactProjectSwitch(body: string): string | undefined {
  const match = /^(?:please\s+)?switch\s+to\s+project\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(body.trim())
  if (!match) return undefined
  const name = match[1] ?? match[2] ?? ''
  if (!name.trim() || name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)) return undefined
  return name
}

const environmentCreateRequest =
  /^(?:please\s+)?(?:create|add)\s+an?\s+environment\s+named\s+(.+?)\s+with\s+base\s+url\b([\s\S]*)$/i

export function isEnvironmentCreateRequest(body: string): boolean {
  return environmentCreateRequest.test(body.trim())
}

/** Accept only an explicit display name and uncredentialed HTTP(S) base URL. */
export function parseExactEnvironmentCreate(body: string): { name: string; baseUrl: string } | undefined {
  const match = environmentCreateRequest.exec(body.trim())
  if (!match) return undefined
  const rawName = match[1]!.trim()
  const quoted = /^(?:"(.*)"|“(.*)”)$/u.exec(rawName)
  const name = (quoted?.[1] ?? quoted?.[2] ?? rawName).trim()
  const baseUrl = match[2]!.trim()
  if (!name || name.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u.test(name)) return undefined
  if (!quoted && /\s/u.test(name)) return undefined
  if (baseUrl.length > 2048 || !/^https?:\/\/[^\s\\?#]+$/iu.test(baseUrl) || /[.!]$/u.test(baseUrl)) return undefined
  try {
    const url = new URL(baseUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined
    return { name, baseUrl }
  } catch {
    return undefined
  }
}

export function isEnvironmentRenameRequest(body: string): boolean {
  return /^(?:please\s+)?rename\s+environment\b/i.test(body.trim())
}

/** Bind a name-only rename to the exact current display name and stored uncredentialed URL. */
export function parseExactEnvironmentRename(
  body: string,
): { currentName: string; baseUrl: string; nextName: string } | undefined {
  const match =
    /^(?:please\s+)?rename\s+environment\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+at\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+to\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)[.!]?$/i.exec(
      body.trim(),
    )
  if (!match) return undefined
  const currentName = match[1] ?? match[2] ?? ''
  const baseUrl = match[3] ?? match[4] ?? ''
  const nextName = match[5] ?? match[6] ?? ''
  const validName = (name: string) =>
    name.length > 0 &&
    name.trim() === name &&
    name.length <= 160 &&
    Buffer.byteLength(name, 'utf8') <= 640 &&
    !/[\u0000-\u001f\u007f]/u.test(name)
  if (
    !validName(currentName) ||
    !validName(nextName) ||
    currentName === nextName ||
    baseUrl.length > 2_048 ||
    !/^https?:\/\/[^\s\\?#]+$/iu.test(baseUrl)
  )
    return undefined
  try {
    const url = new URL(baseUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined
    return { currentName, baseUrl, nextName }
  } catch {
    return undefined
  }
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
