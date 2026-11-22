'use client'

import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { useEffect, useRef, useState, useTransition, type MutableRefObject } from 'react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

import {
  answerQualityJourneyAnalysisQuestionAction,
  approveQualityJourneyAnalysisAction,
  requestQualityJourneyAnalysisRevisionAction,
} from '../quality-journey-actions'
import { AnalysisCriteriaReview, formatAnalysisFeedback, type CriteriaFeedback } from './analysis-criteria-review'
import { AnalysisQuestionList } from './analysis-question-list'
import { ExactAnalysisReview } from './exact-analysis-review'
import { useJourneyStatusFreshness } from './journey-status-observation'
import type { AnalysisRevisionView } from './quality-journey-view-model'

const storedDraftSchema = z.object({
  answers: z.record(z.string()),
  feedback: z.record(z.object({ general: z.string(), criteria: z.record(z.string()) })),
})

function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function idsForAction(
  ref: MutableRefObject<Record<string, { answerId: string; idempotencyKey: string }>>,
  key: string,
) {
  if (!ref.current[key]) {
    ref.current[key] = { answerId: actionId('analysis-answer'), idempotencyKey: actionId('analysis-answer-request') }
  }
  return ref.current[key]
}

function reviewAvailability({
  analysisReviewHash,
  answerable,
  hasDecision,
  newerVersionAvailable,
  publication,
  stage,
}: {
  analysisReviewHash: string | undefined
  answerable: boolean
  hasDecision: boolean
  newerVersionAvailable: boolean
  publication: unknown
  stage: string
}) {
  const current = !hasDecision && !newerVersionAvailable
  return {
    canAnswer: answerable && current,
    canReview: stage === 'ANALYSIS_REVIEW' && Boolean(publication) && Boolean(analysisReviewHash) && current,
  }
}

function FreshnessNotice({ newerVersionAvailable }: { newerVersionAvailable: boolean }) {
  if (!newerVersionAvailable) return null
  return (
    <p className="text-sm text-warning" role="status">
      A newer version is available. Load it before recording answers or a review decision.
    </p>
  )
}

export function AnalysisReviewControls({
  journeyId,
  stage,
  stateHash,
  analysisReviewHash,
  answerable,
  unresolvedQuestionIds,
  analysis,
  discoveryReady = true,
  previousAnalyses = [],
}: {
  journeyId: string
  stage: string
  stateHash: string
  analysisReviewHash: string | undefined
  answerable: boolean
  unresolvedQuestionIds: string[]
  analysis: AnalysisRevisionView | null
  discoveryReady?: boolean
  previousAnalyses?: AnalysisRevisionView[]
}) {
  const { refresh } = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, { general: string; criteria: CriteriaFeedback }>>(
    {},
  )
  const [draftOwner, setDraftOwner] = useState<string | null>(null)
  const revisionKey = analysis?.analysisRevisionId ?? 'pending'
  const criteriaFeedback = feedbackDrafts[revisionKey]?.criteria ?? {}
  function updateFeedback(key: string, value: string) {
    setFeedbackDrafts(current => ({
      ...current,
      [revisionKey]: { general: '', criteria: { ...current[revisionKey]?.criteria, [key]: value } },
    }))
  }
  useEffect(() => {
    try {
      const saved = storedDraftSchema.safeParse(
        JSON.parse(sessionStorage.getItem(`appraise:analysis-drafts:${journeyId}`) ?? 'null'),
      )
      setAnswers(saved.success ? saved.data.answers : {})
      setFeedbackDrafts(saved.success ? saved.data.feedback : {})
    } catch {
      /* Draft persistence is best effort; the server remains authoritative. */
    }
    setDraftOwner(journeyId)
  }, [journeyId])
  useEffect(() => {
    if (draftOwner !== journeyId) return
    try {
      sessionStorage.setItem(
        `appraise:analysis-drafts:${journeyId}`,
        JSON.stringify({ answers, feedback: feedbackDrafts }),
      )
    } catch {
      /* Keep input in memory when browser storage is unavailable. */
    }
  }, [answers, feedbackDrafts, draftOwner, journeyId])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ids = useRef<Record<string, { answerId: string; idempotencyKey: string }>>({})
  const reviewIds = useRef({
    commandId: actionId('analysis-review'),
    idempotencyKey: actionId('analysis-review-request'),
  })
  const revisionIds = useRef<Record<string, { commandId: string; idempotencyKey: string }>>({})
  const freshness = useJourneyStatusFreshness()

  if (!analysis) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Analysis review</CardTitle>
          <CardDescription>The Requirement Analyzer has not submitted a charter for review yet.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const hasDecision = Boolean(analysis.decision)
  const { canAnswer, canReview } = reviewAvailability({
    analysisReviewHash,
    answerable,
    hasDecision,
    newerVersionAvailable: freshness.newerVersionAvailable,
    publication: analysis.publication,
    stage,
  })
  const { analysisRevisionId, artifactId, contentHash } = analysis

  function recordAnswer(question: AnalysisRevisionView['questions'][number]) {
    const answer = answers[`${analysisRevisionId}:${question.questionId}`]?.trim()
    if (!answer) return
    const latest = question.answers.at(-1)
    // Exact retries retain identity; a new revision, answer head or edited payload is a new operation.
    const action = idsForAction(
      ids,
      JSON.stringify([analysisRevisionId, question.questionId, latest?.answerId, answer]),
    )
    setError(null)
    startTransition(async () => {
      const response = await answerQualityJourneyAnalysisQuestionAction({
        journeyId,
        analysisRevisionId,
        questionId: question.questionId,
        answer,
        answerId: action.answerId,
        idempotencyKey: action.idempotencyKey,
        ...(latest ? { correctionOfAnswerId: latest.answerId } : {}),
      })
      if (!response.success) {
        const message = response.error ?? 'Unable to record this answer.'
        setError(message)
        toast({ title: 'Answer failed', description: message, variant: 'destructive' })
        return
      }
      toast({ title: 'Answer recorded', description: 'Your answer is saved. The next step will update automatically.' })
      refresh()
    })
  }

  function requestRevision(criterionKey: string) {
    if (!analysis) return
    if (!canReview || isPending) return
    const revisionFeedback = formatAnalysisFeedback(analysis, '', {
      [criterionKey]: criteriaFeedback[criterionKey] ?? '',
    })
    if (!revisionFeedback) return
    const key = JSON.stringify([analysisRevisionId, stateHash, analysisReviewHash, revisionFeedback])
    revisionIds.current[key] ??= {
      commandId: actionId('analysis-revision'),
      idempotencyKey: actionId('analysis-revision-request'),
    }
    const identity = revisionIds.current[key]
    setError(null)
    startTransition(async () => {
      try {
        const response = await requestQualityJourneyAnalysisRevisionAction({
          journeyId,
          analysisRevisionId,
          artifactId,
          contentHash,
          expectedStateHash: stateHash,
          expectedReviewHash: analysisReviewHash,
          feedback: revisionFeedback,
          commandId: identity.commandId,
          idempotencyKey: identity.idempotencyKey,
        })
        if (!response.success) {
          const message = response.error ?? 'Unable to request an analysis revision.'
          setError(message)
          toast({ title: 'Revision request failed', description: message, variant: 'destructive' })
          return
        }
        toast({
          title: 'Revision requested',
          description: 'Your feedback is saved for the next version.',
        })
        refresh()
      } catch {
        setError('The change response was interrupted. Retry to recover the same request.')
      }
    })
  }

  function approve() {
    setError(null)
    startTransition(async () => {
      const response = await approveQualityJourneyAnalysisAction({
        journeyId,
        analysisRevisionId,
        artifactId,
        contentHash,
        expectedStateHash: stateHash,
        commandId: reviewIds.current.commandId,
        idempotencyKey: reviewIds.current.idempotencyKey,
      })
      if (!response.success) {
        const message = response.error ?? 'Unable to approve this analysis revision.'
        setError(message)
        toast({ title: 'Approval failed', description: message, variant: 'destructive' })
        return
      }
      toast({ title: 'Analysis approved', description: 'Appraise recorded the exact revision decision.' })
      refresh()
    })
  }

  if (analysis.questions.some(question => question.required && !question.answers.length)) {
    return (
      <section className="space-y-4" aria-label="Analysis questions and review controls">
        <FreshnessNotice newerVersionAvailable={freshness.newerVersionAvailable} />
        <AnalysisQuestionList
          analysisRevisionId={analysisRevisionId}
          answers={Object.fromEntries(
            analysis.questions.map(question => [
              question.questionId,
              answers[`${analysisRevisionId}:${question.questionId}`] ?? '',
            ]),
          )}
          canAnswer={canAnswer}
          isPending={isPending}
          onAnswerChange={(questionId, answer) =>
            setAnswers(current => ({ ...current, [`${analysisRevisionId}:${questionId}`]: answer }))
          }
          onRecordAnswer={recordAnswer}
          questions={analysis.questions}
          unresolvedQuestionIds={unresolvedQuestionIds}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section className="space-y-5" aria-label="Analysis questions and review controls">
      <FreshnessNotice newerVersionAvailable={freshness.newerVersionAvailable} />
      <AnalysisCriteriaReview
        analysis={analysis}
        previous={previousAnalyses.find(previous => previous.revision === analysis.revision - 1)}
        previousFeedback={
          previousAnalyses.find(previous => previous.revision === analysis.revision - 1)?.criteriaFeedback ??
          feedbackDrafts[
            previousAnalyses.find(previous => previous.revision === analysis.revision - 1)?.analysisRevisionId ?? ''
          ]?.criteria
        }
        feedback={criteriaFeedback}
        onFeedbackChange={updateFeedback}
        onSendChange={requestRevision}
        editable={canReview}
        isPending={isPending}
      />
      {analysis.questions.length ? (
        <AnalysisQuestionList
          analysisRevisionId={analysis.analysisRevisionId}
          answers={Object.fromEntries(
            analysis.questions.map(question => [
              question.questionId,
              answers[`${analysisRevisionId}:${question.questionId}`] ?? '',
            ]),
          )}
          canAnswer={canAnswer}
          isPending={isPending}
          onAnswerChange={(questionId, answer) =>
            setAnswers(current => ({ ...current, [`${analysisRevisionId}:${questionId}`]: answer }))
          }
          onRecordAnswer={recordAnswer}
          questions={analysis.questions}
          unresolvedQuestionIds={unresolvedQuestionIds}
        />
      ) : null}
      {previousAnalyses.length ? (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Previous versions and answers ({previousAnalyses.length})
          </summary>
          <div className="mt-4 space-y-5">
            {previousAnalyses.map(previous => (
              <section key={previous.analysisRevisionId} className="space-y-3">
                <h3 className="text-sm font-semibold">Version {previous.revision}</h3>
                <p className="text-sm">{previous.objectives.join(' · ')}</p>
                <ul className="space-y-2 text-sm">
                  {previous.obligations.map(obligation => (
                    <li key={obligation.obligationId}>{obligation.statement}</li>
                  ))}
                </ul>
                {previous.questions.map(question => (
                  <div className="text-sm" key={question.id}>
                    <p className="font-medium">{question.prompt}</p>
                    <p>{question.answers.at(-1)?.answer ?? 'No answer recorded.'}</p>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </details>
      ) : null}
      <ExactAnalysisReview
        approvalBlockedReason={discoveryReady ? undefined : 'Complete the Discovery setup above before approval.'}
        analysis={analysis}
        canReview={canReview}
        error={error}
        isPending={isPending}
        onApprove={approve}
        unresolvedQuestionIds={unresolvedQuestionIds}
      />
    </section>
  )
}
