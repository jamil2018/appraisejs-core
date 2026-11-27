'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { chatAnalysisQuestionSchema, chatAnalysisReviewSchema } from '@/lib/conversation/analysis-review'
import { chatContextKinds } from '@/lib/conversation/chat-context'
import {
  conversationCollaborationReviewSchema,
  parseConversationCollaborationRequest,
} from '@/lib/conversation/collaboration-review'
import { selectEvidenceStep } from '@/lib/conversation/journey-evidence'
import { chatScenarioReviewSchema, isScenarioApprovalRequest } from '@/lib/conversation/scenario-review'
import { workspaceRecordHref } from '@/lib/conversation/workspace-records'
import {
  isCheckoutOrderNumberRequest,
  isAnalysisApprovalRequest,
  isJourneyEvidenceRequest,
  parseAnalysisAnswerReply,
  parseAttachedCaseRename,
  parseWorkspaceRequest,
} from '@/lib/conversation/workspace-request'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'
import { answerAuthoringWorkspaceRequest } from '@/services/conversation/authoring-workspace-requests'
import {
  prepareConversationCollaboration,
  readConversationCollaborationOperation,
} from '@/services/conversation/conversation-collaboration-review'
import { readConversationJourneyEvidence } from '@/services/conversation/conversation-journey-evidence'
import { readConversationExecution } from '@/services/conversation/conversation-execution-service'
import {
  answerConversationReportRequest,
  parseConversationReportRequest,
} from '@/services/conversation/conversation-report-requests'
import { answerProjectWorkspaceRequest } from '@/services/conversation/project-workspace-requests'
import {
  appendConversationTurn,
  getLatestConversationCollaborationOperation,
  getLatestConversationJourney,
  getProjectConversation,
  replayConversationTurn,
  type AppendConversationTurnInput,
  type ConversationTurn,
} from '@/services/conversation/conversation-service'
import { loadChatContext } from '@/services/conversation/chat-context-service'
import { scheduleAppManagedJourneyContinuation } from '@/services/coordinator/app-managed-progression-service'
import { cleanupRejectedDivergentCollaborationWorktree } from '@/services/repository-collaboration/divergent-reconciliation-service'
import { continueAcceptedCollaborationOperation } from '@/services/repository-collaboration/operation-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { answerWorkspaceRequest } from '@/services/workspace-search/workspace-record-search'

const order = z
  .object({
    projectId: qualityJourneyIdentifierSchema,
    conversationId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid(),
    content: z.string().trim().min(1).max(8000),
    analysisReview: chatAnalysisReviewSchema.optional(),
    analysisQuestion: chatAnalysisQuestionSchema.optional(),
    scenarioReview: chatScenarioReviewSchema.optional(),
    collaborationReview: conversationCollaborationReviewSchema.optional(),
    context: z
      .object({
        kind: z.enum(chatContextKinds),
        id: qualityJourneyIdentifierSchema,
        shownTitle: z.string().min(1).max(512).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

async function verifyContext(projectId: string, reference: z.infer<typeof order>['context']) {
  if (!reference) return undefined
  const record = await loadChatContext(projectId, reference)
  if (!record) throw new ServiceError('The attached record is unavailable in this project.', 'NOT_FOUND')
  return record
}

function requireRenameContext(context: Awaited<ReturnType<typeof verifyContext>>, shownTitle: string | undefined) {
  if (context?.kind !== 'TEST_CASE') {
    throw new ServiceError('Attach a test case before renaming it in chat.', 'VALIDATION')
  }
  if (shownTitle !== context.title) {
    throw new ServiceError('The case name changed. Attach it again to review its current name.', 'CONFLICT')
  }
}

async function answerEvidenceRequest(
  targetProjectId: string,
  conversationId: string | undefined,
  context: Awaited<ReturnType<typeof verifyContext>>,
): Promise<NonNullable<AppendConversationTurnInput['reply']>> {
  const unavailable = { content: 'No verified step evidence is available in this saved Journey chat.' }
  if (!conversationId) return unavailable
  const scope = { targetProjectId, conversationId }
  const journeyId = await getLatestConversationJourney(scope)
  if (!journeyId || (context && (context.kind !== 'QUALITY_JOURNEY' || context.id !== journeyId))) return unavailable
  const evidence = await readConversationJourneyEvidence({ ...scope, journeyId })
  const matched = selectEvidenceStep(evidence.runs.filter(run => run.executionCycleId === evidence.latestCycleId))
  if (!matched) return unavailable
  return {
    content: matched.step.status === 'FAILED' ? 'Here is the recorded failed step.' : 'Here is the recorded step.',
    records: [
      { kind: 'REPORT', id: matched.reportId, reportStepId: matched.step.id, title: matched.step.label.slice(0, 512) },
    ],
  }
}

function savedTurnResponse(turn: ConversationTurn, evidenceRequest: boolean) {
  const evidence = evidenceRequest
    ? turn.messages.flatMap(message => message.records).find(record => record.kind === 'REPORT' && record.reportStepId)
    : undefined
  return {
    success: true as const,
    conversationId: turn.conversation.id,
    ...(evidence ? { evidenceHref: workspaceRecordHref(turn.conversation.targetProjectId, evidence) } : {}),
  }
}

async function answerCollaborationRequest(
  request: Exclude<ReturnType<typeof parseConversationCollaborationRequest>, null | { kind: 'DECIDE' }>,
  scope: { targetProjectId: string; conversationId: string; idempotencyKey: string },
): Promise<NonNullable<AppendConversationTurnInput['reply']>> {
  if (request.kind === 'PREPARE') {
    await getProjectConversation({ ...scope, limit: 1 })
    const operation = await prepareConversationCollaboration({
      targetProjectId: scope.targetProjectId,
      intent: request.intent,
      idempotencyKey: `chat:${scope.conversationId}:${scope.idempotencyKey}`,
    })
    if (!operation.id)
      return {
        content:
          'Appraise could not confirm preparation. Check collaboration history before requesting another operation.',
      }
    return {
      content: `Prepared operation recorded with status ${operation.state.toLowerCase().replaceAll('_', ' ')}. Review the exact scope before continuing.`,
      records: [{ kind: 'COLLABORATION', id: operation.id, title: 'Review collaboration operation' }],
    }
  }
  const operationId = await getLatestConversationCollaborationOperation(scope)
  if (!operationId)
    return { content: 'This chat has no saved collaboration operation. Open Collaboration to see project history.' }
  const operation = await readConversationCollaborationOperation(scope.targetProjectId, operationId)
  return {
    content: `The saved operation is ${operation.state.toLowerCase().replaceAll('_', ' ')}.`,
    records: [{ kind: 'COLLABORATION', id: operation.id, title: 'View recorded operation' }],
  }
}

async function answerReportRequest(
  targetProjectId: string,
  request: NonNullable<ReturnType<typeof parseConversationReportRequest>>,
): Promise<NonNullable<AppendConversationTurnInput['reply']>> {
  const result = await answerConversationReportRequest(targetProjectId, request)
  if (result.kind === 'COMPARE_LATEST') {
    if (!result.comparison) return { content: 'At least two saved reports are needed in this project.' }
    const { baseline, candidate, cases } = result.comparison
    const changed = cases.filter(
      item => item.baseline !== null && item.candidate !== null && item.baseline !== item.candidate,
    ).length
    const displayResult = (value: string) => value.toLowerCase().replaceAll('_', ' ')
    return {
      content: `The earlier run recorded ${displayResult(baseline.result)} and the latest recorded ${displayResult(candidate.result)}. ${changed} ${changed === 1 ? 'case changed' : 'cases changed'} outcome across both runs.`,
      records: [baseline, candidate].map(item => ({
        kind: 'REPORT',
        id: item.reportId,
        title: item.name.slice(0, 512),
      })),
    }
  }
  return {
    content: result.items.length
      ? 'Here are the most recent saved reports in this project.'
      : 'This project has no saved reports.',
    records: result.items.map(item => ({ kind: 'REPORT', id: item.id, title: item.name.slice(0, 512) })),
  }
}

async function answerActivityRequest(
  targetProjectId: string,
  conversationId: string | undefined,
  context: Awaited<ReturnType<typeof verifyContext>>,
) {
  if (!conversationId) return { content: 'Open the saved Journey chat to see its recorded run activity.' }
  const scope = { targetProjectId, conversationId }
  const journeyId = await getLatestConversationJourney(scope)
  if (!journeyId || (context && (context.kind !== 'QUALITY_JOURNEY' || context.id !== journeyId)))
    return { content: 'Open the chat linked to the Journey whose run activity you want to see.' }
  const { execution } = await readConversationExecution({ ...scope, journeyId })
  const cycle = execution.cycles.at(-1)
  if (!cycle) return { content: 'Appraise has no recorded execution for this Journey yet.' }
  const unknown = cycle.testRuns.some(run => run.diagnostic?.duplicateLaunchPrevented)
  return {
    content: unknown
      ? 'Appraise cannot confirm whether the original run is still active. Open the recorded run to check its evidence.'
      : `The latest recorded execution is ${cycle.status.toLowerCase()}.`,
    records: cycle.testRuns.slice(0, 8).map((run, index) => ({
      kind: 'TEST_RUN' as const,
      id: run.testRunId,
      title: `Recorded test run ${index + 1}`,
    })),
  }
}

async function answerLocalWorkspaceRequest(
  scope: { targetProjectId: string; content: string; conversationId?: string },
  context: Awaited<ReturnType<typeof verifyContext>>,
): Promise<AppendConversationTurnInput['reply']> {
  const { targetProjectId, content, conversationId } = scope
  if (/^(?:start|create)\s+(?:(?:a|new)\s+)*(?:quality\s+)?journey(?:\s+.+)?[.!?]?$/i.test(content))
    return {
      content: 'Open the Journey brief to describe what you want to check. Appraise saves it for your review.',
      records: [
        { kind: 'QUALITY_JOURNEY', id: targetProjectId, title: 'Start a Quality Journey', destination: 'create' },
      ],
    }
  if (/^(?:show|check) (?:the )?(?:run|execution) (?:activity|status)[.!?]?$/i.test(content))
    return answerActivityRequest(targetProjectId, conversationId, context)
  const report = parseConversationReportRequest(content)
  if (report) return answerReportRequest(targetProjectId, report)
  const workspace = parseWorkspaceRequest(content)
  if (workspace) return answerWorkspaceRequest(targetProjectId, workspace)
  return (await answerAuthoringWorkspaceRequest(scope)) ?? answerProjectWorkspaceRequest(scope)
}

export async function submitConversationMessage(input: unknown) {
  const result = order.safeParse(input)
  if (!result.success) return { success: false as const, error: 'Enter a message of 1–8,000 characters.' }
  const { projectId, conversationId, idempotencyKey, content } = result.data
  const evidenceRequest = isJourneyEvidenceRequest(content)
  try {
    const project = await requireActiveProjectForMutation()
    if (project.id !== projectId) throw new ServiceError('This chat belongs to a different project.', 'CONFLICT')
    const analysisReview =
      isCheckoutOrderNumberRequest(content) || isAnalysisApprovalRequest(content)
        ? result.data.analysisReview
        : undefined
    const analysisQuestion = parseAnalysisAnswerReply(content) ? result.data.analysisQuestion : undefined
    const scenarioReview = isScenarioApprovalRequest(content) ? result.data.scenarioReview : undefined
    const collaborationRequest = parseConversationCollaborationRequest(content)
    const collaborationReview = collaborationRequest?.kind === 'DECIDE' ? result.data.collaborationReview : undefined
    if (collaborationRequest && (!conversationId || (collaborationRequest.kind === 'DECIDE' && !collaborationReview)))
      throw new ServiceError('Open the exact collaboration operation in a saved chat to continue.', 'CONFLICT')
    if (isScenarioApprovalRequest(content) && !scenarioReview)
      throw new ServiceError('Open the current scenario review in this saved Journey chat to approve it.', 'CONFLICT')
    const turn = {
      targetProjectId: project.id,
      conversationId,
      idempotencyKey,
      content,
      analysisReview,
      analysisQuestion,
      scenarioReview,
      collaborationReview,
    }
    const existing = await replayConversationTurn({ ...turn, context: result.data.context })
    if (existing) return savedTurnResponse(existing, evidenceRequest)
    const context = await verifyContext(project.id, result.data.context)
    const renameAttachedCaseTo = parseAttachedCaseRename(content)
    if (renameAttachedCaseTo !== undefined) requireRenameContext(context, result.data.context?.shownTitle)
    const hasLocalDecision =
      renameAttachedCaseTo !== undefined || analysisReview || analysisQuestion || scenarioReview || collaborationReview
    const reply = evidenceRequest
      ? await answerEvidenceRequest(project.id, conversationId, context)
      : collaborationRequest && collaborationRequest.kind !== 'DECIDE' && conversationId
        ? await answerCollaborationRequest(collaborationRequest, {
            targetProjectId: project.id,
            conversationId,
            idempotencyKey,
          })
        : hasLocalDecision
          ? undefined
          : await answerLocalWorkspaceRequest(turn, context)
    const resultTurn = await appendConversationTurn({ ...turn, context, reply, renameAttachedCaseTo })
    const decision = resultTurn.collaborationDecision
    if (decision && decision.afterCommit !== 'NONE') {
      after(async () => {
        try {
          if (decision.afterCommit === 'CONTINUE_ACCEPTED')
            await continueAcceptedCollaborationOperation({ operationId: decision.operationId })
          else await cleanupRejectedDivergentCollaborationWorktree(decision.operationId)
        } catch {
          console.error('Collaboration continuation requires attention for the recorded operation.')
        }
      })
      revalidatePath('/collaboration')
    }
    const wake = resultTurn.analysisWake ?? resultTurn.scenarioWake
    if (wake) {
      scheduleAppManagedJourneyContinuation(wake)
      revalidatePath(`/quality-journeys/${wake.journeyId}`)
    }
    if (renameAttachedCaseTo !== undefined) revalidatePath('/test-cases')
    revalidatePath('/conversations')
    return savedTurnResponse(resultTurn, evidenceRequest)
  } catch (error) {
    const response =
      error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
    return { success: false as const, status: response.status, error: response.error ?? 'Couldn’t save your message.' }
  }
}
