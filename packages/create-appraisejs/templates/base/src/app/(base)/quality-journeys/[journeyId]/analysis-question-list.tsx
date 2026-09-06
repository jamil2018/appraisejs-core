'use client'

import { MessageSquareMore } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { AnalysisRevisionView } from './quality-journey-view-model'

type AnalysisQuestion = AnalysisRevisionView['questions'][number]

type AnalysisQuestionListProps = {
  analysisRevisionId: string
  answers: Record<string, string>
  canAnswer: boolean
  isPending: boolean
  onAnswerChange: (questionId: string, answer: string) => void
  onRecordAnswer: (question: AnalysisQuestion) => void
  questions: AnalysisQuestion[]
  unresolvedQuestionIds: string[]
}

type AnalysisQuestionItemProps = Omit<
  AnalysisQuestionListProps,
  'analysisRevisionId' | 'questions' | 'unresolvedQuestionIds'
> & {
  question: AnalysisQuestion
  unresolved: boolean
  open: boolean
}

function QuestionStatus({ question, unresolved }: Pick<AnalysisQuestionItemProps, 'question' | 'unresolved'>) {
  const answered = question.answers.length > 0
  const status = answered ? 'Answered' : question.required ? (unresolved ? 'Open' : 'Open') : 'Open—optional'
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        {question.rationale ? (
          <p className="text-sm text-muted-foreground">Why this matters: {question.rationale}</p>
        ) : null}
      </div>
      <Badge variant={unresolved ? 'destructive' : 'outline'}>
        {question.required ? `Required · ${status}` : status}
      </Badge>
    </div>
  )
}

function RecordedAnswer({ answer }: { answer: AnalysisQuestion['answers'][number] | undefined }) {
  if (!answer) return null

  return (
    <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm">
      <p>{answer.answer}</p>
      <details className="mt-2 text-muted-foreground">
        <summary className="cursor-pointer text-[11px]">Technical details</summary>
        <p className="mt-1 break-all font-mono text-[11px]">Answer ID: {answer.answerId}</p>
      </details>
    </div>
  )
}

function AnswerForm({
  answer,
  isPending,
  latest,
  onAnswerChange,
  onRecordAnswer,
  question,
}: Pick<AnalysisQuestionItemProps, 'isPending' | 'onAnswerChange' | 'onRecordAnswer' | 'question'> & {
  answer: string
  latest: AnalysisQuestion['answers'][number] | undefined
}) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <div className="space-y-2">
        <Label htmlFor={`analysis-answer-${question.id}`}>{latest ? 'Correct answer' : 'Answer'}</Label>
        <Textarea
          id={`analysis-answer-${question.id}`}
          onChange={event => onAnswerChange(question.questionId, event.target.value)}
          value={answer}
        />
      </div>
      <Button
        disabled={isPending || !answer.trim()}
        onClick={() => onRecordAnswer(question)}
        type="button"
        variant="outline"
      >
        {isPending ? 'Recording…' : latest ? 'Record correction' : 'Record answer'}
      </Button>
    </div>
  )
}

function AnalysisQuestionItem({
  answers,
  canAnswer,
  isPending,
  onAnswerChange,
  onRecordAnswer,
  question,
  unresolved,
  open,
}: AnalysisQuestionItemProps) {
  const latest = question.answers.at(-1)
  const answer = answers[question.questionId] ?? ''

  return (
    <li className="rounded-md border border-white/[0.08] bg-white/[0.025]">
      <details className="p-4" open={open}>
        <summary className="cursor-pointer pr-3 text-sm font-medium">{question.prompt}</summary>
        <div className="mt-4">
          <QuestionStatus question={question} unresolved={unresolved} />
          <details className="mt-3 text-muted-foreground">
            <summary className="cursor-pointer text-[11px]">Technical details</summary>
            <p className="mt-1 break-all font-mono text-[11px]">Question ID: {question.questionId}</p>
          </details>
          <RecordedAnswer answer={latest} />
          {canAnswer ? (
            <AnswerForm {...{ answer, isPending, latest, onAnswerChange, onRecordAnswer, question }} />
          ) : null}
        </div>
      </details>
    </li>
  )
}

export function AnalysisQuestionList({
  analysisRevisionId,
  answers,
  canAnswer,
  isPending,
  onAnswerChange,
  onRecordAnswer,
  questions,
  unresolvedQuestionIds,
}: AnalysisQuestionListProps) {
  const unresolved = new Set(unresolvedQuestionIds)
  const requiredOpen = questions.filter(question => question.required && !question.answers.length)
  const optionalOpen = questions.filter(question => !question.required && !question.answers.length)
  const answered = questions.filter(question => question.answers.length > 0)

  function questionList(items: AnalysisQuestion[], openFirst = false) {
    return (
      <ol className="space-y-4">
        {items.map((question, index) => (
          <AnalysisQuestionItem
            answers={answers}
            canAnswer={canAnswer}
            isPending={isPending}
            key={question.id}
            onAnswerChange={onAnswerChange}
            onRecordAnswer={onRecordAnswer}
            open={openFirst && index === 0}
            question={question}
            unresolved={unresolved.has(question.questionId)}
          />
        ))}
      </ol>
    )
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareMore aria-hidden="true" className="size-4 text-primary" />
          Questions about the proposed test approach
        </CardTitle>
        <CardDescription>
          Answer the required questions first. Each answer is saved as a new record, so corrections remain visible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-xs">Technical details</summary>
          <p className="mt-1 break-all font-mono text-[11px]">Approach version: {analysisRevisionId}</p>
        </details>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">The Analyzer did not raise any questions for this revision.</p>
        ) : (
          <>
            {requiredOpen.length ? (
              <section aria-label="Required questions">
                <h3 className="mb-3 text-sm font-semibold">Required questions ({requiredOpen.length})</h3>
                {questionList(requiredOpen, true)}
              </section>
            ) : null}
            {optionalOpen.length ? (
              <section aria-label="Optional questions">
                <h3 className="mb-3 text-sm font-semibold">Optional questions ({optionalOpen.length})</h3>
                {questionList(optionalOpen)}
              </section>
            ) : null}
            {answered.length ? (
              <section aria-label="Answered questions">
                <h3 className="mb-3 text-sm font-semibold">Answered questions ({answered.length})</h3>
                {questionList(answered)}
              </section>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
