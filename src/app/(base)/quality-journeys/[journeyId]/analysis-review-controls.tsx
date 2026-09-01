'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type MutableRefObject } from 'react'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

import {
  answerQualityJourneyAnalysisQuestionAction,
  approveQualityJourneyAnalysisAction,
  requestQualityJourneyAnalysisRevisionAction,
} from '../quality-journey-actions'
import { AnalysisQuestionList } from './analysis-question-list'
import { ExactAnalysisReview } from './exact-analysis-review'
import type { AnalysisRevisionView } from './quality-journey-view-model'

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

export function AnalysisReviewControls({
  journeyId,
  stage,
  stateHash,
  analysisReviewHash,
  answerable,
  unresolvedQuestionIds,
  analysis,
}: {
  journeyId: string
  stage: string
  stateHash: string
  analysisReviewHash: string | undefined
  answerable: boolean
  unresolvedQuestionIds: string[]
  analysis: AnalysisRevisionView | null
}) {
  const { refresh } = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const ids = useRef<Record<string, { answerId: string; idempotencyKey: string }>>({})
  const reviewIds = useRef({
    commandId: actionId('analysis-review'),
    idempotencyKey: actionId('analysis-review-request'),
  })
  const revisionIds = useRef({
    commandId: actionId('analysis-revision'),
    idempotencyKey: actionId('analysis-revision-request'),
  })

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
  const canAnswer = answerable && !hasDecision
  const canReview =
    stage === 'ANALYSIS_REVIEW' && Boolean(analysis.publication) && Boolean(analysisReviewHash) && !hasDecision
  const { analysisRevisionId, artifactId, contentHash } = analysis

  function recordAnswer(question: AnalysisRevisionView['questions'][number]) {
    const answer = answers[question.questionId]?.trim()
    if (!answer) return
    const action = idsForAction(ids, question.questionId)
    const latest = question.answers.at(-1)
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
      toast({ title: 'Answer recorded', description: 'The Q&A review projection has been refreshed.' })
      refresh()
    })
  }

  function requestRevision() {
    if (!feedback.trim()) return
    setError(null)
    startTransition(async () => {
      const response = await requestQualityJourneyAnalysisRevisionAction({
        journeyId,
        analysisRevisionId,
        artifactId,
        contentHash,
        expectedStateHash: stateHash,
        expectedReviewHash: analysisReviewHash,
        feedback,
        commandId: revisionIds.current.commandId,
        idempotencyKey: revisionIds.current.idempotencyKey,
      })
      if (!response.success) {
        const message = response.error ?? 'Unable to request an analysis revision.'
        setError(message)
        toast({ title: 'Revision request failed', description: message, variant: 'destructive' })
        return
      }
      toast({
        title: 'Revision requested',
        description: 'A fresh Analyzer assignment will receive this durable feedback.',
      })
      refresh()
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

  return (
    <section className="space-y-5" aria-label="Analysis questions and review controls">
      <AnalysisQuestionList
        analysisRevisionId={analysis.analysisRevisionId}
        answers={answers}
        canAnswer={canAnswer}
        isPending={isPending}
        onAnswerChange={(questionId, answer) => setAnswers(current => ({ ...current, [questionId]: answer }))}
        onRecordAnswer={recordAnswer}
        questions={analysis.questions}
        unresolvedQuestionIds={unresolvedQuestionIds}
      />
      <ExactAnalysisReview
        analysis={analysis}
        canReview={canReview}
        error={error}
        feedback={feedback}
        isPending={isPending}
        onApprove={approve}
        onFeedbackChange={setFeedback}
        onRequestRevision={requestRevision}
        unresolvedQuestionIds={unresolvedQuestionIds}
      />
    </section>
  )
}
