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
}

function QuestionStatus({ question, unresolved }: Pick<AnalysisQuestionItemProps, 'question' | 'unresolved'>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-medium">{question.prompt}</p>
        {question.rationale ? (
          <p className="mt-1 text-sm text-muted-foreground">Why this matters: {question.rationale}</p>
        ) : null}
      </div>
      <Badge variant={unresolved ? 'destructive' : 'outline'}>
        {question.required ? 'Required' : 'Optional'} · {unresolved ? 'Open' : 'Answered'}
      </Badge>
    </div>
  )
}

function RecordedAnswer({ answer }: { answer: AnalysisQuestion['answers'][number] | undefined }) {
  if (!answer) return null

  return (
    <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-sm">
      <p>{answer.answer}</p>
      <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Answer ID: {answer.answerId}</p>
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
}: AnalysisQuestionItemProps) {
  const latest = question.answers.at(-1)
  const answer = answers[question.questionId] ?? ''

  return (
    <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-4">
      <QuestionStatus question={question} unresolved={unresolved} />
      <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">Question ID: {question.questionId}</p>
      <RecordedAnswer answer={latest} />
      {canAnswer ? <AnswerForm {...{ answer, isPending, latest, onAnswerChange, onRecordAnswer, question }} /> : null}
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

  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareMore aria-hidden="true" className="size-4 text-primary" />
          Requirement Q&A
        </CardTitle>
        <CardDescription>
          Answers are immutable and bound to analysis revision {analysisRevisionId}. A correction appends another
          answer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">The Analyzer did not raise any questions for this revision.</p>
        ) : (
          <ol className="space-y-4">
            {questions.map(question => (
              <AnalysisQuestionItem
                answers={answers}
                canAnswer={canAnswer}
                isPending={isPending}
                key={question.id}
                onAnswerChange={onAnswerChange}
                onRecordAnswer={onRecordAnswer}
                question={question}
                unresolved={unresolved.has(question.questionId)}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
