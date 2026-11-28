import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient, ProjectConversation, ProjectConversationMessage } from '@prisma/client'

import prisma from '@/config/db-config'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import {
  chatAnalysisQuestionSchema,
  chatAnalysisReviewSchema,
  type ChatAnalysisQuestion,
  type ChatAnalysisReview,
} from '@/lib/conversation/analysis-review'
import { parseCaseDeletionRequest, type CaseDeletionReview } from '@/lib/conversation/case-deletion-review'
import { isRunStopRequest, runStopReviewSchema, type RunStopReview } from '@/lib/conversation/run-stop-review'
import { chatContextKinds, type ChatContext } from '@/lib/conversation/chat-context'
import {
  conversationCollaborationReviewSchema,
  parseConversationCollaborationRequest,
  type ConversationCollaborationReview,
} from '@/lib/conversation/collaboration-review'
import {
  chatScenarioReviewSchema,
  isScenarioApprovalRequest,
  type ChatScenarioReview,
} from '@/lib/conversation/scenario-review'
import {
  conversationRecordKinds,
  isCreatableRecordKind,
  type ConversationRecord,
} from '@/lib/conversation/workspace-records'
import {
  isAnalysisApprovalRequest,
  isEnvironmentCreateRequest,
  isEnvironmentRenameRequest,
  isCaseFromTemplateRequest,
  isNamedCasesSuiteAddRequest,
  isSuiteCreateRequest,
  isRunPermissionApprovalRequest,
  parseAnalysisAnswerReply,
  parseAttachedCaseSuiteAdd,
  parseNamedCasesSuiteAdd,
  parseExactEnvironmentCreate,
  parseExactEnvironmentRename,
  parseExactCaseFromTemplate,
  parseExactLocatorGroupCreate,
  parseExactLocatorGroupRename,
  parseExactModuleRename,
  parseExactSuiteCreate,
  parseExactSuiteRename,
  parseExactTagCreate,
  parseExactTagRename,
  parseRootModuleCreate,
  type RunPermissionReview,
} from '@/lib/conversation/workspace-request'
import { isSharedResourceId } from '@/lib/quality-journey/shared-resource-contract'
import { createModuleInTransaction, renameExactModuleInTransaction } from '@/services/module/module-service'
import { createEnvironmentInTransaction, renameExactEnvironmentInTransaction } from '@/services/environment/environment-service'
import {
  createLocatorGroupInTransaction,
  renameExactLocatorGroupInTransaction,
} from '@/services/locator-group/locator-group-service'
import { createTagInTransaction, renameExactFilterTagInTransaction } from '@/services/tag/tag-service'
import {
  addAttachedCaseToTestSuiteInTransaction,
  addNamedCasesToTestSuiteInTransaction,
  createTestSuiteInTransaction,
  renameExactTestSuiteInTransaction,
} from '@/services/test-suite/test-suite-service'
import { ServiceError } from '@/services/shared/errors'
import {
  renameTestCaseTitleInTransaction,
  resolveReviewedTestCaseDeletionInTransaction,
  createTestCaseFromExactTemplateInTransaction,
} from '@/services/test-case/test-case-service'

import {
  answerConversationAnalysisQuestion,
  approveConversationAnalysis,
  requestConversationAnalysisRevision,
} from './conversation-analysis-review'
import { approveConversationScenarios } from './conversation-scenario-review'
import { decideConversationCollaborationInTransaction } from './conversation-collaboration-review'
import { buildCaseDeletionReview, readCaseDeletionReview } from './conversation-case-deletion-service'

export type { ConversationRecord } from '@/lib/conversation/workspace-records'
export type ConversationContext = ChatContext
export type AppendConversationTurnInput = {
  targetProjectId: string
  conversationId?: string
  idempotencyKey: string
  content: string
  context?: ConversationContext
  /** Only a trusted app boundary may supply a locally verified, read-only reply. */
  reply?: { content: string; records?: readonly ConversationRecord[] }
  previewCaseDeletion?: boolean
  /** Exact attached TEST_CASE rename; mutually exclusive with a precomputed reply. */
  renameAttachedCaseTo?: string
  /** One attached case into one uniquely named active suite in one named module. */
  addAttachedCaseToSuite?: { suiteName: string; moduleName: string }
  /** Two to eight named live cases added to one exact suite without removal. */
  addNamedCasesToSuite?: { caseTitles: string[]; suiteName: string; moduleName: string }
  /** Exact old and new suite names inside one named module. */
  renameExactSuite?: { currentName: string; moduleName: string; nextName: string }
  /** Rename one active filter tag identified by current name and expression. */
  renameExactTag?: { currentName: string; tagExpression: string; nextName: string }
  /** Rename one active module from an exact displayed name and optional parent. */
  renameExactModule?: {
    currentName: string
    nextName: string
    scope: 'UNIQUE' | 'ROOT' | 'PARENT'
    parentName?: string
  }
  /** One empty locator group in one uniquely named active module at a literal route. */
  createExactLocatorGroup?: { name: string; moduleName: string; route: string }
  /** Exact displayed group, module, and route; only the group name changes. */
  renameExactLocatorGroup?: { currentName: string; moduleName: string; route: string; nextName: string }
  /** Explicit root module creation recognized at the trusted app boundary. */
  createRootModuleName?: string
  /** Explicit name and expression for one project tag. */
  createExactTag?: { name: string; tagExpression: string }
  /** Explicit name and base URL for one project environment without credential fields. */
  createExactEnvironment?: { name: string; baseUrl: string }
  /** Rename only the name of the exact environment shown with its stored URL. */
  renameExactEnvironment?: { currentName: string; baseUrl: string; nextName: string }
  /** One suite in exactly one active module named in the current project. */
  createExactSuite?: { name: string; moduleName: string }
  /** One self-contained active template with exact title and name. */
  createCaseFromTemplate?: { title: string; templateName: string }
  /** Exact published review shown in this saved conversation. */
  analysisReview?: ChatAnalysisReview
  analysisQuestion?: ChatAnalysisQuestion
  scenarioReview?: ChatScenarioReview
  collaborationReview?: ConversationCollaborationReview
}
export type ConversationSummary = {
  id: string
  targetProjectId: string
  title: string
  createdAt: number
  updatedAt: number
}
export type ConversationMessage = {
  id: string
  conversationId: string
  ordinal: number
  role: 'USER' | 'APPRAISE'
  content: string
  context: ConversationContext | null
  records: ConversationRecord[]
  caseDeletionReview?: CaseDeletionReview
  createdAt: number
}
export type ConversationTurn = {
  conversation: ConversationSummary
  messages: ConversationMessage[]
  replayed: boolean
  analysisWake?: Awaited<ReturnType<typeof requestConversationAnalysisRevision>>
  scenarioWake?: Awaited<ReturnType<typeof approveConversationScenarios>>['wake']
  collaborationDecision?: Awaited<ReturnType<typeof decideConversationCollaborationInTransaction>>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = (message: string): never => {
  throw new ServiceError(message, 'VALIDATION', 400)
}
const conflict = (message: string): never => {
  throw new ServiceError(message, 'CONFLICT', 409)
}
const validateProject = (id: unknown): string => (isSharedResourceId(id) ? id : bad('Target project id is invalid.'))
const validateUuid = (id: unknown): string =>
  typeof id === 'string' && uuid.test(id) ? id.toLowerCase() : bad('Conversation id must be a UUID.')
const bounded = (value: unknown, name: string, max: number): string => {
  if (typeof value !== 'string') return bad(`${name} is invalid.`)
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > max) return bad(`${name} is out of bounds.`)
  return normalized
}
const sourceId = (value: unknown, name: string): string =>
  typeof value === 'string' && /^[\x20-\x7e]{1,200}$/.test(value) ? value : bad(`${name} is invalid.`)
const sourceTitle = (value: unknown, name: string): string => {
  const title = bounded(value, name, 2_048)
  return title.length <= 512 ? title : bad(`${name} is out of bounds.`)
}
const chatContent = (value: unknown, name: string): string => {
  const content = bounded(value, name, 32_768)
  return content.length <= 8_000 ? content : bad(`${name} is out of bounds.`)
}
const attachment = (value: ConversationContext | undefined): ConversationContext | undefined => {
  if (value === undefined) return undefined
  if (!value || !chatContextKinds.includes(value.kind)) return bad('Context kind is invalid.')
  return { kind: value.kind, id: sourceId(value.id, 'Context id'), title: sourceTitle(value.title, 'Context title') }
}
const replyRecords = (
  records: readonly ConversationRecord[] | undefined,
  targetProjectId: string,
): ConversationRecord[] => {
  if (records === undefined) return []
  if (!Array.isArray(records) || records.length > 8) return bad('Reply records exceed the bound.')
  const seen = new Set<string>()
  return records.map(record => {
    if (!record || !conversationRecordKinds.includes(record.kind)) return bad('Reply record kind is invalid.')
    if (record.reportStepId !== undefined && record.kind !== 'REPORT') return bad('Step evidence needs a report.')
    if (record.stepReference !== undefined) {
      const reference = record.stepReference
      if (
        record.kind !== 'STEP_DEFINITION' ||
        record.destination !== undefined ||
        !reference ||
        typeof reference !== 'object' ||
        Array.isArray(reference) ||
        Object.keys(reference).length !== 2 ||
        typeof reference.version !== 'string' ||
        !/^[\x21-\x7e]{1,40}$/.test(reference.version) ||
        typeof reference.definitionHash !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(reference.definitionHash)
      )
        return bad('Exact step reference is invalid.')
    }
    if (
      record.destination !== undefined &&
      (record.destination !== 'create' || !isCreatableRecordKind(record.kind) || record.id !== targetProjectId)
    )
      return bad('The setup destination does not belong to this project.')
    const result: ConversationRecord = {
      kind: record.kind,
      id: sourceId(record.id, 'Reply record id'),
      title: sourceTitle(record.title, 'Reply record title'),
      ...(record.reportStepId === undefined ? {} : { reportStepId: sourceId(record.reportStepId, 'Report step id') }),
      ...(record.stepReference === undefined ? {} : { stepReference: { ...record.stepReference } }),
      ...(record.destination === 'create' ? { destination: record.destination } : {}),
    }
    const key = JSON.stringify([result.kind, result.id, result.reportStepId, result.destination, result.stepReference])
    if (seen.has(key)) return bad('Duplicate reply record.')
    seen.add(key)
    return result
  })
}
const summary = (row: ProjectConversation): ConversationSummary => ({
  id: row.id,
  targetProjectId: row.targetProjectId,
  title: row.title,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
})
const message = (row: ProjectConversationMessage): ConversationMessage => {
  const caseDeletionReview = readCaseDeletionReview(row.caseDeletionReviewJson)
  return {
    id: row.id,
    conversationId: row.conversationId,
    ordinal: row.ordinal,
    role: row.role,
    content: row.content,
    context: row.contextJson ? (JSON.parse(row.contextJson) as ConversationContext) : null,
    records: row.recordsJson ? (JSON.parse(row.recordsJson) as ConversationRecord[]) : [],
    ...(caseDeletionReview ? { caseDeletionReview } : {}),
    createdAt: row.createdAt.getTime(),
  }
}
const requestDigest = (
  content: string,
  context: { kind: ConversationContext['kind']; id: string } | undefined,
  analysisReview?: ChatAnalysisReview,
  analysisQuestion?: ChatAnalysisQuestion,
  scenarioReview?: ChatScenarioReview,
  collaborationReview?: ConversationCollaborationReview,
  runPermissionReview?: RunPermissionReview,
  runStopReview?: RunStopReview,
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        content,
        context: context ? { kind: context.kind, id: context.id } : null,
        analysisReview,
        analysisQuestion,
        scenarioReview,
        collaborationReview,
        runPermissionReview,
        runStopReview,
      }),
    )
    .digest('hex')
const isUniqueConflict = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'

async function lookupReplay(
  client: PrismaClient | Prisma.TransactionClient,
  targetProjectId: string,
  conversationId: string | undefined,
  key: string,
  digest: string,
): Promise<ConversationTurn | null> {
  const conversation = conversationId
    ? await client.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
    : await client.projectConversation.findUnique({
        where: { targetProjectId_initialIdempotencyKey: { targetProjectId, initialIdempotencyKey: key } },
      })
  if (!conversation) return null
  const user = await client.projectConversationMessage.findUnique({
    where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey: key } },
  })
  if (!user) return null
  if (user.role !== 'USER' || user.requestHash !== digest)
    return conflict('Idempotency key was used for a different message.')
  const rows = await client.projectConversationMessage.findMany({
    where: { conversationId: conversation.id, turnId: user.turnId },
    orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
    take: 2,
  })
  if (rows.length < 1 || rows[0].id !== user.id) return conflict('Conversation turn is inconsistent.')
  return { conversation: summary(conversation), messages: rows.map(message), replayed: true }
}

/** Recover a committed answer before any mutable source record is resolved again. */
export async function replayConversationTurn(
  input: {
    targetProjectId: string
    conversationId?: string
    idempotencyKey: string
    content: string
    context?: { kind: ConversationContext['kind']; id: string }
    analysisReview?: ChatAnalysisReview
    analysisQuestion?: ChatAnalysisQuestion
    scenarioReview?: ChatScenarioReview
    collaborationReview?: ConversationCollaborationReview
    runPermissionReview?: RunPermissionReview
    runStopReview?: RunStopReview
  },
  client: PrismaClient = prisma,
): Promise<ConversationTurn | undefined> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = input.conversationId === undefined ? undefined : validateUuid(input.conversationId)
  const key = bounded(input.idempotencyKey, 'Idempotency key', 128)
  const content = chatContent(input.content, 'Message')
  const context = input.context
  const analysisReview = input.analysisReview && chatAnalysisReviewSchema.parse(input.analysisReview)
  const analysisQuestion = input.analysisQuestion && chatAnalysisQuestionSchema.parse(input.analysisQuestion)
  const scenarioReview = input.scenarioReview && chatScenarioReviewSchema.parse(input.scenarioReview)
  const collaborationReview =
    input.collaborationReview && conversationCollaborationReviewSchema.parse(input.collaborationReview)
  const runStopReview = input.runStopReview && runStopReviewSchema.parse(input.runStopReview)
  if (context && (!chatContextKinds.includes(context.kind) || !/^[\x20-\x7e]{1,200}$/.test(context.id)))
    return bad('Context identity is invalid.')
  return (
    (await lookupReplay(
      client,
      targetProjectId,
      conversationId,
      key,
      requestDigest(
        content,
        context,
        analysisReview,
        analysisQuestion,
        scenarioReview,
        collaborationReview,
        input.runPermissionReview,
        runStopReview,
      ),
    )) ?? undefined
  )
}

type RunControlTurn = {
  targetProjectId: string
  conversationId: string
  idempotencyKey: string
  content: string
  context?: ConversationContext
}

/** Record the exact human reply inside the canonical Run permission reservation transaction. */
export function recordRunPermissionTurnInTransaction(
  tx: Prisma.TransactionClient,
  input: RunControlTurn & { runPermissionReview: RunPermissionReview },
) {
  return recordRunControlInTransaction(tx, input, { kind: 'permission', review: input.runPermissionReview })
}

/** Record the exact human request inside the canonical cancellation transaction. */
export function recordRunStopTurnInTransaction(
  tx: Prisma.TransactionClient,
  input: RunControlTurn & { runStopReview: RunStopReview },
) {
  return recordRunControlInTransaction(tx, input, {
    kind: 'stop',
    review: runStopReviewSchema.parse(input.runStopReview),
  })
}

async function recordRunControlInTransaction(
  tx: Prisma.TransactionClient,
  input: RunControlTurn,
  control: { kind: 'permission'; review: RunPermissionReview } | { kind: 'stop'; review: RunStopReview },
): Promise<ConversationTurn> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = validateUuid(input.conversationId)
  const key = bounded(input.idempotencyKey, 'Idempotency key', 128)
  const content = chatContent(input.content, 'Message')
  const context = attachment(input.context)
  const validCommand =
    control.kind === 'permission' ? isRunPermissionApprovalRequest(content) : isRunStopRequest(content)
  if (!validCommand || (context && (context.kind !== 'QUALITY_JOURNEY' || context.id !== control.review.journeyId)))
    return bad(
      control.kind === 'permission'
        ? 'Review the exact Run permission in this saved Journey chat.'
        : 'Open the current run activity in this saved Journey chat.',
    )
  const conversation = await tx.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
  if (!conversation) throw new ServiceError('Conversation not found.', 'NOT_FOUND', 404)
  const digest = requestDigest(
    content,
    context,
    undefined,
    undefined,
    undefined,
    undefined,
    control.kind === 'permission' ? control.review : undefined,
    control.kind === 'stop' ? control.review : undefined,
  )
  const existing = await tx.projectConversationMessage.findUnique({
    where: { conversationId_idempotencyKey: { conversationId, idempotencyKey: key } },
  })
  if (existing)
    return conflict(
      control.kind === 'permission'
        ? 'Run permission turn already exists. Recover it with the same request key.'
        : 'The stop request turn already exists. Recover it with the same request key.',
    )
  const allocated = await tx.projectConversation.update({
    where: { id: conversationId },
    data: { nextOrdinal: { increment: 2 } },
  })
  const turnId = randomUUID()
  const user = await tx.projectConversationMessage.create({
    data: {
      conversationId,
      ordinal: allocated.nextOrdinal - 2,
      role: 'USER',
      content,
      contextJson: context ? JSON.stringify(context) : null,
      turnId,
      idempotencyKey: key,
      requestHash: digest,
    },
  })
  const reply = await tx.projectConversationMessage.create({
    data: {
      conversationId,
      ordinal: allocated.nextOrdinal - 1,
      role: 'APPRAISE',
      content:
        control.kind === 'permission'
          ? 'Run permission recorded. Check the saved Journey activity for the original attempt.'
          : 'Stop requested. Check Activity for the recorded outcome.',
      recordsJson: JSON.stringify([
        { kind: 'QUALITY_JOURNEY', id: control.review.journeyId, title: 'View run activity' },
      ]),
      turnId,
    },
  })
  return { conversation: summary(allocated), messages: [message(user), message(reply)], replayed: false }
}

async function applyAnalysisTurn(
  tx: Prisma.TransactionClient,
  scope: { targetProjectId: string; conversationId: string; key: string },
  content: string,
  analysisReview?: ChatAnalysisReview,
  analysisQuestion?: ChatAnalysisQuestion,
) {
  const journeyId = analysisQuestion?.journeyId ?? analysisReview?.journeyId
  if (!journeyId) return undefined
  if ((await getLatestConversationJourney(scope, tx)) !== journeyId)
    return conflict('This Journey is no longer linked to the saved chat.')
  if (analysisQuestion) {
    const answer = parseAnalysisAnswerReply(content)
    if (!answer) return bad('Reply with Answer: followed by your choice.')
    const wake = await answerConversationAnalysisQuestion(tx, { ...scope, ...analysisQuestion, answer })
    return { wake, message: 'Answer recorded for this Journey.' }
  }
  if (!analysisReview) return undefined
  if (isAnalysisApprovalRequest(content)) {
    const { wake, revision } = await approveConversationAnalysis(tx, { ...scope, ...analysisReview })
    return { wake, message: `Test approach revision ${revision} approved.` }
  }
  const wake = await requestConversationAnalysisRevision(tx, { ...scope, ...analysisReview, feedback: content })
  return { wake, message: 'Revision requested. The updated checks will appear here when they’re ready for review.' }
}

/** Append one user message and its optional verified local answer as a single SQLite transaction. */
export async function appendConversationTurn(
  input: AppendConversationTurnInput,
  client: PrismaClient = prisma,
): Promise<ConversationTurn> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = input.conversationId === undefined ? undefined : validateUuid(input.conversationId)
  const idempotencyKey = bounded(input.idempotencyKey, 'Idempotency key', 128)
  const content = chatContent(input.content, 'Message')
  const context = attachment(input.context)
  const isRename = input.renameAttachedCaseTo !== undefined
  const submittedMembership = input.addAttachedCaseToSuite
  const exactMembership = submittedMembership ? parseAttachedCaseSuiteAdd(content) : undefined
  const isMembership = submittedMembership !== undefined
  const submittedNamedMembership = input.addNamedCasesToSuite
  const exactNamedMembership = submittedNamedMembership ? parseNamedCasesSuiteAdd(content) : undefined
  const isNamedMembership = submittedNamedMembership !== undefined
  const submittedSuiteRename = input.renameExactSuite
  const exactSuiteRename = submittedSuiteRename ? parseExactSuiteRename(content) : undefined
  const isSuiteRename = submittedSuiteRename !== undefined
  const submittedTagRename = input.renameExactTag
  const exactTagRename = submittedTagRename ? parseExactTagRename(content) : undefined
  const isTagRename = submittedTagRename !== undefined
  const submittedModuleRename = input.renameExactModule
  const exactModuleRename = submittedModuleRename ? parseExactModuleRename(content) : undefined
  const isModuleRename = submittedModuleRename !== undefined
  const submittedLocatorGroup = input.createExactLocatorGroup
  const exactLocatorGroup = submittedLocatorGroup ? parseExactLocatorGroupCreate(content) : undefined
  const isLocatorGroupCreate = submittedLocatorGroup !== undefined
  const submittedLocatorGroupRename = input.renameExactLocatorGroup
  const exactLocatorGroupRename = submittedLocatorGroupRename ? parseExactLocatorGroupRename(content) : undefined
  const isLocatorGroupRename = submittedLocatorGroupRename !== undefined
  const isModuleCreate = input.createRootModuleName !== undefined
  const isTagCreate = input.createExactTag !== undefined
  const isEnvironmentCreate = input.createExactEnvironment !== undefined
  const submittedEnvironmentRename = input.renameExactEnvironment
  const isEnvironmentRename = submittedEnvironmentRename !== undefined
  const exactEnvironmentRename = isEnvironmentRename ? parseExactEnvironmentRename(content) : undefined
  const submittedSuite = input.createExactSuite
  const isSuiteCreate = submittedSuite !== undefined
  const exactSuite = isSuiteCreate ? parseExactSuiteCreate(content) : undefined
  const submittedCaseCreate = input.createCaseFromTemplate
  const isCaseCreate = submittedCaseCreate !== undefined
  const exactCaseCreate = isCaseCreate ? parseExactCaseFromTemplate(content) : undefined
  const caseDeletionTitles = parseCaseDeletionRequest(content)
  if (Boolean(caseDeletionTitles) !== Boolean(input.previewCaseDeletion))
    return bad('Review case deletion through the exact saved chat request.')
  if (isNamedCasesSuiteAddRequest(content) && !exactNamedMembership)
    return bad('Name two to eight distinct cases and one exact suite and module.')
  if (
    caseDeletionTitles &&
    (context ||
      input.reply ||
      isRename ||
      isMembership ||
      isNamedMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleRename ||
      isLocatorGroupCreate ||
      isLocatorGroupRename ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isEnvironmentRename ||
      isSuiteCreate ||
      isCaseCreate ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview)
  )
    return bad('Review case deletion without an attachment or another action in the same message.')
  if (parseExactModuleRename(content) && !isModuleRename)
    return bad('Rename one exact module through the trusted conversation action.')
  if (parseExactLocatorGroupCreate(content) && !isLocatorGroupCreate)
    return bad('Create one exact locator group through the trusted conversation action.')
  if (parseExactLocatorGroupRename(content) && !isLocatorGroupRename)
    return bad('Rename one exact locator group through the trusted conversation action.')
  if (isEnvironmentCreateRequest(content) && !isEnvironmentCreate)
    return bad(
      'Create one environment with an exact name and an HTTP(S) base URL without credentials, query, or fragment.',
    )
  if (isEnvironmentRenameRequest(content) && !isEnvironmentRename)
    return bad('Quote the current environment name, its exact URL, and the new name.')
  if (
    isEnvironmentRename &&
    (input.reply !== undefined || context !== undefined || isRename || isMembership || isNamedMembership ||
      isSuiteRename || isTagRename || isModuleRename || isLocatorGroupCreate || isLocatorGroupRename ||
      isModuleCreate || isTagCreate || isEnvironmentCreate || isSuiteCreate || isCaseCreate ||
      input.analysisReview || input.analysisQuestion || input.scenarioReview || input.collaborationReview ||
      !exactEnvironmentRename ||
      exactEnvironmentRename.currentName !== submittedEnvironmentRename.currentName ||
      exactEnvironmentRename.baseUrl !== submittedEnvironmentRename.baseUrl ||
      exactEnvironmentRename.nextName !== submittedEnvironmentRename.nextName)
  )
    return bad('Rename one exact environment without another action or attachment.')
  if (isSuiteCreateRequest(content) && !isSuiteCreate)
    return bad('Name one test suite and one existing module in this project.')
  if (isCaseFromTemplateRequest(content) && !isCaseCreate)
    return bad('Quote one new test case title and one exact template name.')
  if (
    isCaseCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isNamedMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleRename ||
      isLocatorGroupCreate ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview ||
      !exactCaseCreate ||
      exactCaseCreate.title !== submittedCaseCreate.title ||
      exactCaseCreate.templateName !== submittedCaseCreate.templateName)
  )
    return bad('Create one test case from one exact self-contained template without another action or attachment.')
  if (isRename && (input.reply !== undefined || context?.kind !== 'TEST_CASE'))
    return bad('A case rename requires a test case attachment and no separate reply.')
  if (
    isNamedMembership &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleRename ||
      isLocatorGroupCreate ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview ||
      !exactNamedMembership ||
      !Array.isArray(submittedNamedMembership.caseTitles) ||
      exactNamedMembership.caseTitles.length !== submittedNamedMembership.caseTitles.length ||
      exactNamedMembership.caseTitles.some((title, index) => title !== submittedNamedMembership.caseTitles[index]) ||
      exactNamedMembership.suiteName !== submittedNamedMembership.suiteName ||
      exactNamedMembership.moduleName !== submittedNamedMembership.moduleName)
  )
    return bad('Add only the named cases to one exact active suite.')
  if (
    isModuleRename &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      isLocatorGroupCreate ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview ||
      !exactModuleRename ||
      exactModuleRename.currentName !== submittedModuleRename.currentName ||
      exactModuleRename.nextName !== submittedModuleRename.nextName ||
      exactModuleRename.scope !== submittedModuleRename.scope ||
      exactModuleRename.parentName !== submittedModuleRename.parentName)
  )
    return bad('Rename one exact active module without another action or attachment.')
  if (
    isLocatorGroupCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleRename ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview ||
      !exactLocatorGroup ||
      exactLocatorGroup.name !== submittedLocatorGroup.name ||
      exactLocatorGroup.moduleName !== submittedLocatorGroup.moduleName ||
      exactLocatorGroup.route !== submittedLocatorGroup.route)
  )
    return bad('Create one empty locator group in one exact module for one literal route.')
  if (
    isLocatorGroupRename &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isNamedMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleRename ||
      isLocatorGroupCreate ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      isCaseCreate ||
      input.previewCaseDeletion ||
      input.analysisReview ||
      input.analysisQuestion ||
      input.scenarioReview ||
      input.collaborationReview ||
      !exactLocatorGroupRename ||
      exactLocatorGroupRename.currentName !== submittedLocatorGroupRename.currentName ||
      exactLocatorGroupRename.moduleName !== submittedLocatorGroupRename.moduleName ||
      exactLocatorGroupRename.route !== submittedLocatorGroupRename.route ||
      exactLocatorGroupRename.nextName !== submittedLocatorGroupRename.nextName)
  )
    return bad('Rename one exact locator group in one module at its current route.')
  if (
    isMembership &&
    (input.reply !== undefined ||
      context?.kind !== 'TEST_CASE' ||
      isRename ||
      isSuiteRename ||
      !exactMembership ||
      exactMembership.suiteName !== submittedMembership.suiteName ||
      exactMembership.moduleName !== submittedMembership.moduleName)
  )
    return bad('Add the attached case to one exact suite in one named module.')
  if (
    isSuiteRename &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isTagRename ||
      !exactSuiteRename ||
      exactSuiteRename.currentName !== submittedSuiteRename.currentName ||
      exactSuiteRename.moduleName !== submittedSuiteRename.moduleName ||
      exactSuiteRename.nextName !== submittedSuiteRename.nextName)
  )
    return bad('Rename one uniquely named test suite in one named module.')
  if (
    isTagRename &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      !exactTagRename ||
      exactTagRename.currentName !== submittedTagRename.currentName ||
      exactTagRename.tagExpression !== submittedTagRename.tagExpression ||
      exactTagRename.nextName !== submittedTagRename.nextName)
  )
    return bad('Rename one exact filter tag with its current name and expression.')
  if (
    isModuleCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      parseRootModuleCreate(content) !== input.createRootModuleName)
  )
    return bad('Create one named root module in a project chat without an attachment.')
  if (
    isTagCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      JSON.stringify(parseExactTagCreate(content)) !== JSON.stringify(input.createExactTag))
  )
    return bad('Create one tag with an exact name and expression in a project chat without an attachment.')
  if (
    isEnvironmentCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isSuiteCreate ||
      JSON.stringify(parseExactEnvironmentCreate(content)) !== JSON.stringify(input.createExactEnvironment))
  )
    return bad('Create one environment with an exact name and base URL in a project chat without an attachment.')
  if (
    isSuiteCreate &&
    (input.reply !== undefined ||
      context !== undefined ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      !submittedSuite ||
      !exactSuite ||
      exactSuite.name !== submittedSuite.name ||
      exactSuite.moduleName !== submittedSuite.moduleName)
  )
    return bad('Create one test suite in an unambiguous existing module in a project chat without an attachment.')
  const analysisReview = input.analysisReview && chatAnalysisReviewSchema.parse(input.analysisReview)
  const analysisQuestion = input.analysisQuestion && chatAnalysisQuestionSchema.parse(input.analysisQuestion)
  const scenarioReview = input.scenarioReview && chatScenarioReviewSchema.parse(input.scenarioReview)
  const collaborationReview =
    input.collaborationReview && conversationCollaborationReviewSchema.parse(input.collaborationReview)
  const collaboration = collaborationReview ? parseConversationCollaborationRequest(content) : null
  const reviewTarget = analysisReview ?? analysisQuestion ?? scenarioReview
  const reviewCount = [analysisReview, analysisQuestion, scenarioReview].filter(Boolean).length
  if (
    reviewTarget &&
    (!conversationId ||
      input.reply ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      reviewCount > 1 ||
      (context && (context.kind !== 'QUALITY_JOURNEY' || context.id !== reviewTarget.journeyId)))
  )
    return bad('Use the Journey question or review linked to this saved chat.')
  if (scenarioReview && !isScenarioApprovalRequest(content))
    return bad('Use “Approve pending scenarios” to approve the displayed portfolio.')
  if (
    collaborationReview &&
    (!conversationId ||
      reviewTarget ||
      input.reply ||
      isRename ||
      isMembership ||
      isSuiteRename ||
      isTagRename ||
      isModuleCreate ||
      isTagCreate ||
      isEnvironmentCreate ||
      isSuiteCreate ||
      collaboration?.kind !== 'DECIDE' ||
      collaborationReview.targetProjectId !== targetProjectId)
  )
    return bad('Use the exact collaboration review linked to this saved chat.')
  const response = input.reply && {
    content: chatContent(input.reply.content, 'Reply'),
    records: replyRecords(input.reply.records, targetProjectId),
  }
  const digest = requestDigest(content, context, analysisReview, analysisQuestion, scenarioReview, collaborationReview)
  const prior = await lookupReplay(client, targetProjectId, conversationId, idempotencyKey, digest)
  if (prior) return prior
  try {
    return await client.$transaction(async tx => {
      const project = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
      if (!project) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)
      let conversation = conversationId
        ? await tx.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
        : await tx.projectConversation.findUnique({
            where: {
              targetProjectId_initialIdempotencyKey: { targetProjectId, initialIdempotencyKey: idempotencyKey },
            },
          })
      if (conversationId && !conversation) {
        const foreign = await tx.projectConversation.findUnique({ where: { id: conversationId }, select: { id: true } })
        if (foreign) throw new ServiceError('Conversation not found.', 'NOT_FOUND', 404)
      }
      if (!conversation)
        conversation = await tx.projectConversation.create({
          data: {
            id: conversationId ?? randomUUID(),
            targetProjectId,
            initialIdempotencyKey: idempotencyKey,
            title: content.replace(/\s+/g, ' ').slice(0, 100),
          },
        })
      const existing = await tx.projectConversationMessage.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey } },
      })
      if (existing) {
        if (existing.requestHash !== digest) return conflict('Idempotency key was used for a different message.')
        const rows = await tx.projectConversationMessage.findMany({
          where: { conversationId: conversation.id, turnId: existing.turnId },
          orderBy: { ordinal: 'asc' },
          take: 2,
        })
        return { conversation: summary(conversation), messages: rows.map(message), replayed: true }
      }
      const scope = { targetProjectId, conversationId: conversation.id, key: idempotencyKey }
      const casesToReview = caseDeletionTitles
        ? await resolveReviewedTestCaseDeletionInTransaction(tx, { targetProjectId, exactTitles: caseDeletionTitles })
        : undefined
      if (scenarioReview && (await getLatestConversationJourney(scope, tx)) !== scenarioReview.journeyId)
        return conflict('This Journey is no longer linked to the saved chat.')
      const effect = scenarioReview
        ? await approveConversationScenarios(tx, { ...scope, ...scenarioReview })
        : await applyAnalysisTurn(tx, scope, content, analysisReview, analysisQuestion)
      if (
        collaborationReview &&
        (await getLatestConversationCollaborationOperation(scope, tx)) !== collaborationReview.operationId
      )
        return conflict('This collaboration operation is no longer linked to the saved chat.')
      const collaborationDecision =
        collaborationReview && collaboration?.kind === 'DECIDE'
          ? await decideConversationCollaborationInTransaction(tx, {
              targetProjectId,
              review: collaborationReview,
              decision: collaboration.decision,
            })
          : undefined
      const count =
        response ||
        casesToReview ||
        isRename ||
        isMembership ||
        isNamedMembership ||
        isSuiteRename ||
        isTagRename ||
        isModuleRename ||
        isLocatorGroupCreate ||
        isLocatorGroupRename ||
        isModuleCreate ||
        isTagCreate ||
        isEnvironmentCreate ||
        isEnvironmentRename ||
        isSuiteCreate ||
        isCaseCreate ||
        effect ||
        collaborationDecision
          ? 2
          : 1
      const allocated = await tx.projectConversation.update({
        where: { id: conversation.id },
        data: { nextOrdinal: { increment: count } },
      })
      const first = allocated.nextOrdinal - count
      let finalResponse = effect ? { content: effect.message, records: [] } : response
      if (casesToReview)
        finalResponse = {
          content: `Found ${casesToReview.length} matching ${casesToReview.length === 1 ? 'case' : 'cases'}.`,
          records: [],
        }
      if (collaborationDecision)
        finalResponse = {
          content: 'Collaboration decision recorded. Open the operation to see its latest status.',
          records: [{ kind: 'COLLABORATION', id: collaborationDecision.operationId, title: 'Collaboration operation' }],
        }
      if (isRename && context) {
        const renamed = await renameTestCaseTitleInTransaction(tx, {
          targetProjectId,
          testCaseId: context.id,
          expectedTitle: context.title,
          nextTitle: input.renameAttachedCaseTo!,
        })
        finalResponse = {
          content: `Renamed the test case to “${renamed.title}”.`,
          records: [{ kind: 'TEST_CASE', id: renamed.id, title: renamed.title }],
        }
      }
      if (exactMembership && context) {
        const membership = await addAttachedCaseToTestSuiteInTransaction(tx, {
          targetProjectId,
          testCaseId: context.id,
          expectedCaseTitle: context.title,
          suiteName: exactMembership.suiteName,
          moduleName: exactMembership.moduleName,
        })
        finalResponse = {
          content: membership.added
            ? `Added the attached case to the test suite “${membership.name}”.`
            : `The attached case is already in the test suite “${membership.name}”.`,
          records: [{ kind: 'TEST_SUITE', id: membership.id, title: membership.name }],
        }
      }
      if (exactNamedMembership) {
        const membership = await addNamedCasesToTestSuiteInTransaction(tx, {
          targetProjectId,
          caseTitles: exactNamedMembership.caseTitles,
          suiteName: exactNamedMembership.suiteName,
          moduleName: exactNamedMembership.moduleName,
        })
        finalResponse = {
          content: membership.addedCount
            ? `Added ${membership.addedCount} ${membership.addedCount === 1 ? 'case' : 'cases'} to the test suite “${membership.name}”.`
            : `All named cases are already in the test suite “${membership.name}”.`,
          records: [{ kind: 'TEST_SUITE', id: membership.id, title: membership.name }],
        }
      }
      if (exactSuiteRename) {
        const renamed = await renameExactTestSuiteInTransaction(tx, { targetProjectId, ...exactSuiteRename })
        finalResponse = {
          content: `Renamed the test suite to “${renamed.name}”.`,
          records: [{ kind: 'TEST_SUITE', id: renamed.id, title: renamed.name }],
        }
      }
      if (exactTagRename) {
        const renamed = await renameExactFilterTagInTransaction(tx, { targetProjectId, ...exactTagRename })
        finalResponse = {
          content: `Renamed the tag to “${renamed.name}”.`,
          records: [{ kind: 'TAG', id: renamed.id, title: renamed.name }],
        }
      }
      if (exactModuleRename) {
        const renamed = await renameExactModuleInTransaction(tx, { targetProjectId, ...exactModuleRename })
        finalResponse = {
          content: `Renamed the module to “${renamed.name}”.`,
          records: [{ kind: 'MODULE', id: renamed.id, title: renamed.name }],
        }
      }
      if (exactLocatorGroup) {
        const modules = await tx.module.findMany({
          where: { targetProjectId, name: exactLocatorGroup.moduleName, archivedAt: null },
          select: { id: true },
          take: 2,
        })
        if (modules.length !== 1) conflict('The named module must identify one active module in this project.')
        const created = await createLocatorGroupInTransaction(
          tx,
          { name: exactLocatorGroup.name, moduleId: modules[0]!.id, route: exactLocatorGroup.route, locators: [] },
          targetProjectId,
        )
        finalResponse = {
          content: `Created the locator group “${created.name}” for route ${created.route}.`,
          records: [{ kind: 'LOCATOR_GROUP', id: created.id, title: created.name }],
        }
      }
      if (exactLocatorGroupRename) {
        const renamed = await renameExactLocatorGroupInTransaction(tx, {
          targetProjectId,
          ...exactLocatorGroupRename,
        })
        finalResponse = {
          content: `Renamed the locator group to “${renamed.name}”.`,
          records: [{ kind: 'LOCATOR_GROUP', id: renamed.id, title: renamed.name }],
        }
      }
      if (isModuleCreate) {
        const created = await createModuleInTransaction(
          tx,
          { name: input.createRootModuleName!, parentId: ROOT_MODULE_UUID },
          targetProjectId,
        )
        finalResponse = {
          content: `Created the module “${created.name}”.`,
          records: [{ kind: 'MODULE', id: created.id, title: created.name }],
        }
      }
      if (isTagCreate) {
        const created = await createTagInTransaction(tx, input.createExactTag!, targetProjectId)
        finalResponse = {
          content: `Created the tag “${created.name}” with expression ${created.tagExpression}.`,
          records: [{ kind: 'TAG', id: created.id, title: created.name }],
        }
      }
      if (isEnvironmentCreate) {
        const created = await createEnvironmentInTransaction(tx, input.createExactEnvironment!, targetProjectId)
        finalResponse = {
          content: `Created the environment “${created.name}” with base URL ${created.baseUrl}.`,
          records: [{ kind: 'ENVIRONMENT', id: created.id, title: created.name }],
        }
      }
      if (exactEnvironmentRename) {
        const renamed = await renameExactEnvironmentInTransaction(tx, {
          targetProjectId, ...exactEnvironmentRename,
        })
        finalResponse = {
          content: `Renamed the environment to “${renamed.name}”. Review Run permission again if it was already requested.`,
          records: [{ kind: 'ENVIRONMENT', id: renamed.id, title: renamed.name }],
        }
      }
      if (exactSuite) {
        const moduleRows = await tx.module.findMany({
          where: { targetProjectId, name: exactSuite.moduleName, archivedAt: null },
          select: { id: true },
          take: 2,
        })
        if (moduleRows.length !== 1) conflict('The named module must identify one active module in this project.')
        const created = await createTestSuiteInTransaction(
          tx,
          { name: exactSuite.name, moduleId: moduleRows[0]!.id },
          targetProjectId,
        )
        finalResponse = {
          content: `Created the test suite “${created.name}”.`,
          records: [{ kind: 'TEST_SUITE', id: created.id, title: created.name }],
        }
      }
      if (exactCaseCreate) {
        const created = await createTestCaseFromExactTemplateInTransaction(tx, {
          targetProjectId,
          ...exactCaseCreate,
        })
        finalResponse = {
          content: `Created the test case “${created.title}” from template “${created.templateName}”.`,
          records: [{ kind: 'TEST_CASE', id: created.id, title: created.title }],
        }
      }
      const turnId = randomUUID()
      const user = await tx.projectConversationMessage.create({
        data: {
          conversationId: conversation.id,
          ordinal: first,
          role: 'USER',
          content,
          contextJson: context ? JSON.stringify(context) : null,
          turnId,
          idempotencyKey,
          requestHash: digest,
        },
      })
      const rows = [user]
      if (finalResponse) {
        const reviewMessageId = casesToReview ? randomUUID() : undefined
        rows.push(
          await tx.projectConversationMessage.create({
            data: {
              id: reviewMessageId,
              conversationId: conversation.id,
              ordinal: first + 1,
              role: 'APPRAISE',
              content: finalResponse.content,
              recordsJson: finalResponse.records.length ? JSON.stringify(finalResponse.records) : null,
              caseDeletionReviewJson:
                casesToReview && reviewMessageId
                  ? JSON.stringify(
                      buildCaseDeletionReview(
                        { targetProjectId, conversationId: conversation.id, messageId: reviewMessageId },
                        casesToReview,
                      ),
                    )
                  : undefined,
              turnId,
            },
          }),
        )
      }
      return {
        conversation: summary(allocated),
        messages: rows.map(message),
        replayed: false,
        ...(scenarioReview ? { scenarioWake: effect?.wake } : { analysisWake: effect?.wake }),
        ...(collaborationDecision ? { collaborationDecision } : {}),
      }
    })
  } catch (error) {
    if (isUniqueConflict(error)) {
      const winner = await lookupReplay(client, targetProjectId, conversationId, idempotencyKey, digest)
      if (winner) return winner
      return conflict('Conversation write conflicted; retry with the same key.')
    }
    throw error
  }
}

export async function listProjectConversations(
  input: { targetProjectId: string; limit?: number; cursor?: string },
  client: PrismaClient = prisma,
): Promise<ConversationSummary[]> {
  const targetProjectId = validateProject(input.targetProjectId)
  const limit = input.limit ?? 30
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad('Conversation list limit is invalid.')
  if (input.cursor) {
    validateUuid(input.cursor)
    const cursor = await client.projectConversation.findFirst({
      where: { id: input.cursor, targetProjectId },
      select: { id: true },
    })
    if (!cursor) throw new ServiceError('Conversation cursor not found.', 'NOT_FOUND', 404)
  }
  const rows = await client.projectConversation.findMany({
    where: { targetProjectId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })
  return rows.map(summary)
}

export async function getProjectConversation(
  input: { targetProjectId: string; conversationId: string; limit?: number; beforeOrdinal?: number },
  client: PrismaClient = prisma,
): Promise<{ conversation: ConversationSummary; messages: ConversationMessage[] }> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = validateUuid(input.conversationId)
  const limit = input.limit ?? 80
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return bad('Conversation history limit is invalid.')
  if (input.beforeOrdinal !== undefined && (!Number.isInteger(input.beforeOrdinal) || input.beforeOrdinal < 1))
    return bad('Conversation history cursor is invalid.')
  const row = await client.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
  if (!row) throw new ServiceError('Conversation not found.', 'NOT_FOUND', 404)
  const rows = await client.projectConversationMessage.findMany({
    where: { conversationId, ...(input.beforeOrdinal ? { ordinal: { lt: input.beforeOrdinal } } : {}) },
    orderBy: [{ ordinal: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  return { conversation: summary(row), messages: rows.reverse().map(message) }
}

export async function getLatestConversationJourney(
  scope: { targetProjectId: string; conversationId: string },
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const message = await client.projectConversationMessage.findFirst({
    where: {
      conversationId: scope.conversationId,
      conversation: { targetProjectId: scope.targetProjectId },
      role: 'USER',
      contextJson: { contains: '"kind":"QUALITY_JOURNEY"' },
    },
    select: { contextJson: true },
    orderBy: { ordinal: 'desc' },
  })
  if (!message?.contextJson) return undefined
  const context = JSON.parse(message.contextJson) as ConversationContext
  return context.kind === 'QUALITY_JOURNEY' ? context.id : undefined
}

export async function getLatestConversationCollaborationOperation(
  scope: { targetProjectId: string; conversationId: string },
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const row = await client.projectConversationMessage.findFirst({
    where: {
      conversationId: scope.conversationId,
      conversation: { targetProjectId: scope.targetProjectId },
      role: 'APPRAISE',
      recordsJson: { contains: '"kind":"COLLABORATION"' },
    },
    select: { recordsJson: true },
    orderBy: { ordinal: 'desc' },
  })
  if (!row?.recordsJson) return undefined
  const records = JSON.parse(row.recordsJson) as ConversationRecord[]
  return records.find(record => record.kind === 'COLLABORATION')?.id
}

/** Bounded per-project relation reads for the workspace sidebar. */
export async function listRecentProjectConversations(
  projectIds: string[],
  client: PrismaClient = prisma,
): Promise<Record<string, { id: string; title: string; updatedAt: number }[]>> {
  if (!Array.isArray(projectIds) || projectIds.some(id => !isSharedResourceId(id)))
    return bad('Project list is invalid.')
  const unique = [...new Set(projectIds)]
  const result: Record<string, { id: string; title: string; updatedAt: number }[]> = Object.fromEntries(
    unique.map(id => [id, []]),
  )
  if (!unique.length) return result
  for (let offset = 0; offset < unique.length; offset += 100) {
    const rows = await client.targetProject.findMany({
      where: { id: { in: unique.slice(offset, offset + 100) } },
      select: {
        id: true,
        conversations: {
          select: { id: true, title: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 8,
        },
      },
    })
    for (const row of rows)
      result[row.id] = row.conversations.map(item => ({ ...item, updatedAt: item.updatedAt.getTime() }))
  }
  return result
}
