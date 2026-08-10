// fallow-ignore-file code-duplication
'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import {
  approveQualityValidationDesignAction,
  answerQualityRequirementQueriesAction,
  compileQualityValidationsAction,
  createQualityAssessmentAction,
  proposeQualityValidationDesignAction,
  publishQualityValidationsAction,
} from '../quality-design-actions'

type Query = { id: string; prompt: string; status: string; answer: string | null; rationale: string | null }
type Obligation = { id: string; title: string; intent: string; minimumAssurance: string; limitations: string | null }
type Validation = {
  id: string
  status: string
  compilationHash: string | null
}

type QualityLifecycleControlsProps = {
  qualityPlanId: string
  revisionId: string
  revisionStatus: string
  designHash: string | null
  queries: Query[]
  obligations: Obligation[]
  validations: Validation[]
}

function idempotencyKey(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
}

function useMutation() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const run = (title: string, operation: () => Promise<{ success?: boolean; error?: string }>) =>
    startTransition(async () => {
      const response = await operation()
      if (response.success) {
        toast({ title })
        router.refresh()
      } else {
        toast({
          title: `${title} failed`,
          description: response.error ?? 'Unable to complete this lifecycle step.',
          variant: 'destructive',
        })
      }
    })
  return { isPending, run }
}

export function QualityLifecycleControls({
  qualityPlanId,
  revisionId,
  revisionStatus,
  designHash,
  queries,
  obligations,
  validations,
}: QualityLifecycleControlsProps) {
  const unresolvedQueries = queries.filter(query => query.status === 'BLOCKING')
  const compilationHash = validations.find(validation => validation.compilationHash)?.compilationHash ?? null

  return (
    <section className="grid gap-6 xl:grid-cols-2" aria-label="Quality lifecycle controls">
      <RequirementQueryAnswers qualityPlanId={qualityPlanId} queries={unresolvedQueries} revisionId={revisionId} />
      <ScenarioDesignControls
        designHash={designHash}
        obligations={obligations}
        qualityPlanId={qualityPlanId}
        revisionId={revisionId}
        revisionStatus={revisionStatus}
      />
      <ValidationRealizationControls
        compilationHash={compilationHash}
        designHash={designHash}
        qualityPlanId={qualityPlanId}
        revisionId={revisionId}
        revisionStatus={revisionStatus}
        validations={validations}
      />
      <AssessmentCreateControls
        qualityPlanId={qualityPlanId}
        revisionId={revisionId}
        revisionStatus={revisionStatus}
        validations={validations}
      />
    </section>
  )
}

function RequirementQueryAnswers({
  qualityPlanId,
  revisionId,
  queries,
}: {
  qualityPlanId: string
  revisionId: string
  queries: Query[]
}) {
  const [answer, setAnswer] = useState('')
  const [rationale, setRationale] = useState('')
  const { isPending, run } = useMutation()

  return (
    <LifecycleCard
      title="Requirement query resolution"
      description="Record an answer, a deferred rationale, or an accepted assumption before requirement approval."
    >
      {queries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No blocking requirement queries need an answer.</p>
      ) : (
        <div className="space-y-4">
          {queries.map(query => (
            <div className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={query.id}>
              <p className="text-sm">{query.prompt}</p>
              <Label htmlFor={`query-answer-${query.id}`}>Answer</Label>
              <Textarea
                id={`query-answer-${query.id}`}
                onChange={event => setAnswer(event.target.value)}
                value={answer}
              />
              <Label htmlFor={`query-rationale-${query.id}`}>Rationale</Label>
              <Textarea
                id={`query-rationale-${query.id}`}
                onChange={event => setRationale(event.target.value)}
                value={rationale}
              />
              <div className="flex flex-wrap gap-2">
                {(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION'] as const).map(status => (
                  <Button
                    disabled={
                      isPending ||
                      (!answer.trim() && status === 'ANSWERED') ||
                      (!rationale.trim() && status !== 'ANSWERED')
                    }
                    key={status}
                    onClick={() =>
                      run('Requirement query recorded', () =>
                        answerQualityRequirementQueriesAction({
                          qualityPlanId,
                          revisionId,
                          idempotencyKey: idempotencyKey('query'),
                          answers: [
                            {
                              queryId: query.id,
                              status,
                              answer: answer.trim() || undefined,
                              rationale: rationale.trim() || undefined,
                            },
                          ],
                        }),
                      )
                    }
                    size="sm"
                    type="button"
                    variant={status === 'ANSWERED' ? 'default' : 'outline'}
                  >
                    {status.replaceAll('_', ' ').toLocaleLowerCase()}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </LifecycleCard>
  )
}

function ScenarioDesignControls({
  designHash,
  obligations,
  qualityPlanId,
  revisionId,
  revisionStatus,
}: Omit<QualityLifecycleControlsProps, 'queries' | 'validations'>) {
  const proposalTemplate = useMemo(
    () =>
      JSON.stringify(
        {
          scenarios: obligations.map((obligation, index) => ({
            id: `scenario-${index + 1}`,
            title: obligation.title,
            obligationIds: [obligation.id],
            behavior: obligation.intent,
            assertions: ['Describe the observable assertion'],
            coverage: { obligationId: obligation.id },
            requiredMinimumAssurance: obligation.minimumAssurance,
            matrixIntent: { browsers: ['CHROMIUM'] },
            limitations: obligation.limitations ? [obligation.limitations] : [],
          })),
        },
        null,
        2,
      ),
    [obligations],
  )
  const [proposal, setProposal] = useState(proposalTemplate)
  const [reviewer, setReviewer] = useState('AppraiseJS reviewer')
  const { isPending, run } = useMutation()
  const canPropose = revisionStatus === 'REQUIREMENTS_APPROVED' || revisionStatus === 'SCENARIO_REVIEW'
  const canApprove = revisionStatus === 'SCENARIO_REVIEW' && Boolean(designHash)

  return (
    <LifecycleCard
      title="Scenario design review"
      description="Propose obligation-linked scenarios, then approve the exact derived design hash."
    >
      <div className="space-y-2">
        <Label htmlFor="quality-scenario-proposal">Scenario proposal JSON</Label>
        <Textarea
          className="min-h-56 font-mono text-xs"
          id="quality-scenario-proposal"
          onChange={event => setProposal(event.target.value)}
          value={proposal}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!canPropose || isPending}
          onClick={() => {
            try {
              const parsed = parseJson(proposal, 'Scenario proposal')
              run('Scenario proposal submitted', () =>
                proposeQualityValidationDesignAction({
                  qualityPlanId,
                  revisionId,
                  proposal: parsed,
                  idempotencyKey: idempotencyKey('scenario'),
                }),
              )
            } catch (error) {
              toast({
                title: 'Scenario proposal is invalid',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              })
            }
          }}
          type="button"
        >
          Propose scenarios
        </Button>
        <Input
          aria-label="Scenario reviewer"
          className="max-w-56"
          onChange={event => setReviewer(event.target.value)}
          value={reviewer}
        />
        <Button
          disabled={!canApprove || isPending || !reviewer.trim()}
          onClick={() =>
            run('Scenario design approved', () =>
              approveQualityValidationDesignAction({
                qualityPlanId,
                revisionId,
                expectedDesignHash: designHash!,
                approvedBy: reviewer,
              }),
            )
          }
          type="button"
          variant="outline"
        >
          Approve scenarios
        </Button>
      </div>
      {designHash ? <HashHint label="Current design hash" value={designHash} /> : null}
    </LifecycleCard>
  )
}

function ValidationRealizationControls({
  compilationHash,
  designHash,
  qualityPlanId,
  revisionId,
  revisionStatus,
  validations,
}: {
  compilationHash: string | null
  designHash: string | null
  qualityPlanId: string
  revisionId: string
  revisionStatus: string
  validations: Validation[]
}) {
  const [realization, setRealization] = useState('')
  const { isPending, run } = useMutation()
  const canCompile = revisionStatus === 'SCENARIOS_APPROVED' || revisionStatus === 'REALIZED'
  const canPublish = revisionStatus === 'REALIZED' && Boolean(compilationHash)

  return (
    <LifecycleCard
      title="Validation realization and publication"
      description="Compile the reviewed scenarios with a sealed runtime-publication envelope, then publish the complete realized set."
    >
      <Label htmlFor="quality-realization">Realization JSON</Label>
      <Textarea
        className="mt-2 min-h-40 font-mono text-xs"
        id="quality-realization"
        onChange={event => setRealization(event.target.value)}
        placeholder='{"default":{"runtimePublication":{...}}}'
        value={realization}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        The envelope must contain the reviewed projection, validation projection, runtime input, and immutable compiler
        hashes.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!canCompile || isPending || !designHash || !realization.trim()}
          onClick={() => {
            try {
              const parsed = parseJson(realization, 'Realization')
              run('Validations compiled', () =>
                compileQualityValidationsAction({
                  qualityPlanId,
                  revisionId,
                  expectedDesignHash: designHash!,
                  realization: parsed,
                }),
              )
            } catch (error) {
              toast({
                title: 'Realization is invalid',
                description: error instanceof Error ? error.message : undefined,
                variant: 'destructive',
              })
            }
          }}
          type="button"
        >
          Compile validations
        </Button>
        <Button
          disabled={!canPublish || isPending}
          onClick={() =>
            run('Validations published', () =>
              publishQualityValidationsAction({
                qualityPlanId,
                revisionId,
                validationVersionIds: validations.map(validation => validation.id),
                expectedCompilationHash: compilationHash!,
              }),
            )
          }
          type="button"
          variant="outline"
        >
          Publish validations
        </Button>
      </div>
      {compilationHash ? <HashHint label="Current compilation hash" value={compilationHash} /> : null}
    </LifecycleCard>
  )
}

function AssessmentCreateControls({
  qualityPlanId,
  revisionId,
  revisionStatus,
  validations,
}: Pick<QualityLifecycleControlsProps, 'qualityPlanId' | 'revisionId' | 'revisionStatus' | 'validations'>) {
  const [subjectDigest, setSubjectDigest] = useState('')
  const [authority, setAuthority] = useState('')
  const [baselineAssessmentId, setBaselineAssessmentId] = useState('')
  const { isPending, run } = useMutation()
  const readyForAssessment =
    revisionStatus === 'REALIZED' &&
    validations.length > 0 &&
    validations.every(validation => validation.status === 'PUBLISHED')

  return (
    <LifecycleCard
      title="Create Assessment"
      description="Bind the published validation matrix to an immutable subject before execution and evidence review."
    >
      <div className="grid gap-3">
        <div className="space-y-2">
          <Label htmlFor="assessment-subject-digest">Subject digest</Label>
          <Input
            id="assessment-subject-digest"
            onChange={event => setSubjectDigest(event.target.value)}
            placeholder="sha256:…"
            value={subjectDigest}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assessment-authority">Subject authority</Label>
          <Input
            id="assessment-authority"
            onChange={event => setAuthority(event.target.value)}
            placeholder="artifact://build-123"
            value={authority}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assessment-baseline">Baseline Assessment ID (optional)</Label>
          <Input
            id="assessment-baseline"
            onChange={event => setBaselineAssessmentId(event.target.value)}
            value={baselineAssessmentId}
          />
        </div>
      </div>
      <Button
        className="mt-4"
        disabled={!readyForAssessment || isPending || !subjectDigest.startsWith('sha256:') || !authority.trim()}
        onClick={() =>
          run('Assessment created', () =>
            createQualityAssessmentAction({
              qualityPlanId,
              revisionId,
              idempotencyKey: idempotencyKey('assessment'),
              baselineAssessmentId: baselineAssessmentId.trim() || undefined,
              subject: { subjectDigest, authority, subjectKind: 'ARTIFACT' },
            }),
          )
        }
        type="button"
      >
        Create Assessment
      </Button>
      {!readyForAssessment ? (
        <p className="mt-3 text-sm text-amber-200">
          Publish every validation version before creating an executable Assessment.
        </p>
      ) : null}
    </LifecycleCard>
  )
}

function LifecycleCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function HashHint({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-4 break-all font-mono text-[11px] text-muted-foreground">
      {label}: {value}
    </p>
  )
}
