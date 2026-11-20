'use client'

import { MessageSquareMore } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const status = answered ? 'Answered' : question.required ? 'Open' : 'Open—optional'
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
    <div className="mt-4 space-y-3">
      {question.suggestedAnswers?.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Suggested answers for ${question.prompt}`}>
          {question.suggestedAnswers.map((suggestion, index) => (
            <Button
              key={suggestion}
              type="button"
              variant={answer === suggestion ? 'secondary' : 'outline'}
              disabled={isPending}
              onClick={() => onAnswerChange(question.questionId, suggestion)}
              aria-pressed={answer === suggestion}
            >
              {suggestion}
              {index === 0 ? ' · Recommended' : ''}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`analysis-answer-${question.id}`}>
          {latest ? 'Correct answer' : 'Your answer'}
          <span className="sr-only">: {question.prompt}</span>
        </Label>
        <Textarea
          id={`analysis-answer-${question.id}`}
          onChange={event => onAnswerChange(question.questionId, event.target.value)}
          value={answer}
        />
      </div>
      <Button
        disabled={isPending || !answer.trim() || answer.trim() === latest?.answer.trim()}
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
          <RecordedAnswer answer={latest} />
          {question.answers.length > 1 ? (
            <details className="mt-3 text-sm text-muted-foreground">
              <summary className="cursor-pointer">Earlier answers ({question.answers.length - 1})</summary>
              <ol className="mt-2 space-y-2">
                {question.answers.slice(0, -1).map(answer => (
                  <li key={answer.answerId}>{answer.answer}</li>
                ))}
              </ol>
            </details>
          ) : null}
          {canAnswer ? (
            <AnswerForm {...{ answer, isPending, latest, onAnswerChange, onRecordAnswer, question }} />
          ) : null}
        </div>
      </details>
    </li>
  )
}

export function AnalysisQuestionList({
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
          <h2>{requiredOpen[0]?.prompt ?? 'Your answers'}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredOpen.length ? (
          <section aria-label="Current essential question" className="space-y-3">
            {requiredOpen[0]!.rationale ? (
              <p className="text-sm text-muted-foreground">{requiredOpen[0]!.rationale}</p>
            ) : null}
            {canAnswer ? (
              <AnswerForm
                answer={answers[requiredOpen[0]!.questionId] ?? ''}
                isPending={isPending}
                latest={undefined}
                onAnswerChange={onAnswerChange}
                onRecordAnswer={onRecordAnswer}
                question={requiredOpen[0]!}
              />
            ) : null}
          </section>
        ) : questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">The Analyzer did not raise any questions for this revision.</p>
        ) : (
          <p className="text-sm text-muted-foreground">All essential questions have been answered.</p>
        )}
        {optionalOpen.length ? (
          <details>
            <summary className="cursor-pointer text-sm">Optional questions ({optionalOpen.length})</summary>
            <div className="mt-3">{questionList(optionalOpen)}</div>
          </details>
        ) : null}
        {answered.length ? (
          <details>
            <summary className="cursor-pointer text-sm">Saved answers ({answered.length})</summary>
            <div className="mt-3">{questionList(answered)}</div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
