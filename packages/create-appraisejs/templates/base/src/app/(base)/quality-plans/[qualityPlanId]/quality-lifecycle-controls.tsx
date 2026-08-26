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
  assessmentPreflightAction,
  assessmentPrepareAction,
  approveQualityValidationDesignAction,
  answerQualityRequirementQueriesAction,
  createQualityAssessmentAction,
  createRemoteEvaluationScopeAction,
  proposeQualityValidationDesignAction,
} from '../quality-design-actions'

type Query = { id: string; prompt: string; status: string; answer: string | null; rationale: string | null }
type Obligation = { id: string; title: string; intent: string; minimumAssurance: string; limitations: string | null }
type Validation = {
  id: string
  status: string
  compilationHash: string | null
  activeGeneration?: {
    id: string
    publicationId: string
    operationHash: string
    runtimeInputHash: string
  } | null
}

type RemotePreflightToken = {
  algorithmVersion: 'appraise.quality-assessment-preflight/v2'
  scopeIntentHash: string
  realizationIntentHash: string
  preflightHash: string
}

type QualityLifecycleControlsProps = {
  qualityPlanId: string
  revisionId: string
  revisionStatus: string
  designHash: string | null
  queries: Query[]
  obligations: Obligation[]
  validations: Validation[]
  targetKind?: string
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
  const run = (
    title: string,
    operation: () => Promise<{ success?: boolean; error?: string; data?: unknown }>,
    onSuccess?: (data: unknown) => void,
  ) =>
    startTransition(async () => {
      const response = await operation()
      if (response.success) {
        onSuccess?.(response.data)
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
  targetKind,
}: QualityLifecycleControlsProps) {
  const unresolvedQueries = queries.filter(query => query.status === 'BLOCKING')
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
      <AssessmentPreparationControls
        designHash={designHash}
        qualityPlanId={qualityPlanId}
        revisionId={revisionId}
        revisionStatus={revisionStatus}
        targetKind={targetKind}
        validations={validations}
      />
      <AssessmentCreateControls
        qualityPlanId={qualityPlanId}
        revisionId={revisionId}
        revisionStatus={revisionStatus}
        targetKind={targetKind}
        designHash={designHash}
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

type BindingFieldsProps = {
  environmentId: string
  bindingsJson: string
  onEnvironmentIdChange: (value: string) => void
  onBindingsJsonChange: (value: string) => void
  environmentLabel: string
  environmentInputId: string
  bindingsLabel: string
  bindingsInputId: string
  bindingsClassName?: string
}

function CompactBindingFields({
  environmentId,
  bindingsJson,
  onEnvironmentIdChange,
  onBindingsJsonChange,
  environmentLabel,
  environmentInputId,
  bindingsLabel,
  bindingsInputId,
  bindingsClassName,
}: BindingFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={environmentInputId}>{environmentLabel}</Label>
        <Input
          id={environmentInputId}
          value={environmentId}
          onChange={event => onEnvironmentIdChange(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={bindingsInputId}>{bindingsLabel}</Label>
        <Textarea
          className={bindingsClassName}
          id={bindingsInputId}
          value={bindingsJson}
          onChange={event => onBindingsJsonChange(event.target.value)}
        />
      </div>
    </>
  )
}

function ArtifactSubjectInputs({
  digest,
  authority,
  onDigestChange,
  onAuthorityChange,
  digestLabel,
  authorityLabel,
}: {
  digest: string
  authority: string
  onDigestChange: (value: string) => void
  onAuthorityChange: (value: string) => void
  digestLabel: string
  authorityLabel: string
}) {
  return (
    <>
      <Input
        aria-label={digestLabel}
        value={digest}
        onChange={event => onDigestChange(event.target.value)}
        placeholder="sha256:…"
      />
      <Input
        aria-label={authorityLabel}
        value={authority}
        onChange={event => onAuthorityChange(event.target.value)}
        placeholder="artifact://build"
      />
    </>
  )
}

function RemoteScopeCreateButton({ disabled, onCreate }: { disabled: boolean; onCreate: () => void }) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={onCreate}>
      Create remote evaluation scope
    </Button>
  )
}

function RemoteScopeSubjectInput({
  inputId,
  value,
  onChange,
  label,
  placeholder,
}: {
  inputId: string
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  )
}

type MutationRunner = ReturnType<typeof useMutation>['run']

function createRemoteScopeFromBindings(input: {
  run: MutationRunner
  qualityPlanId: string
  revisionId: string
  designHash: string | null
  bindingsJson: string
  environmentId: string
  onCreated: (id: string) => void
  detailedError?: boolean
}) {
  try {
    input.run(
      'Remote evaluation scope created',
      () =>
        createRemoteEvaluationScopeAction({
          qualityPlanId: input.qualityPlanId,
          revisionId: input.revisionId,
          expectedDesignHash: input.designHash,
          validationBindings: parseJson(input.bindingsJson, 'Validation bindings'),
          environmentId: input.environmentId.trim(),
          idempotencyKey: idempotencyKey('remote-scope'),
        }),
      data => {
        const id = (data as { subjectRevisionId?: unknown } | undefined)?.subjectRevisionId
        if (typeof id === 'string') input.onCreated(id)
      },
    )
  } catch (error) {
    toast({
      title: 'Validation bindings are invalid',
      description: input.detailedError && error instanceof Error ? error.message : undefined,
      variant: 'destructive',
    })
  }
}

function runAssessmentPreflight(input: {
  run: MutationRunner
  compact: () => object
  onCompleted: (token: RemotePreflightToken | null) => void
}) {
  try {
    input.run(
      'Assessment preflight completed',
      () => assessmentPreflightAction(input.compact()),
      data => {
        const candidate = data as Partial<RemotePreflightToken> | undefined
        const token =
          candidate?.algorithmVersion === 'appraise.quality-assessment-preflight/v2' &&
          typeof candidate.scopeIntentHash === 'string' &&
          typeof candidate.realizationIntentHash === 'string' &&
          typeof candidate.preflightHash === 'string'
            ? {
                algorithmVersion: candidate.algorithmVersion,
                scopeIntentHash: candidate.scopeIntentHash,
                realizationIntentHash: candidate.realizationIntentHash,
                preflightHash: candidate.preflightHash,
              }
            : null
        input.onCompleted(token)
      },
    )
  } catch {
    toast({ title: 'Validation bindings are invalid', variant: 'destructive' })
  }
}

function preparationReady(revisionStatus: string, designHash: string | null, validations: Validation[]) {
  return revisionStatus === 'SCENARIOS_APPROVED' && Boolean(designHash) && validations.length > 0
}

function preparationSubject(remote: boolean, subjectRevisionId: string, subjectDigest: string, authority: string) {
  return remote
    ? { subjectRevisionId: subjectRevisionId.trim() }
    : { subjectDigest: subjectDigest.trim(), authority: authority.trim(), subjectKind: 'ARTIFACT' as const }
}

function preflightDisabled(input: {
  ready: boolean
  environmentId: string
  isPending: boolean
  remote: boolean
  subjectRevisionId: string
  subjectDigest: string
  authority: string
}) {
  return (
    !input.ready ||
    !input.environmentId.trim() ||
    input.isPending ||
    (input.remote ? !input.subjectRevisionId.trim() : !input.subjectDigest || !input.authority)
  )
}

function assessmentReady(revisionStatus: string, validations: Validation[]) {
  return (
    revisionStatus === 'REALIZED' &&
    validations.length > 0 &&
    validations.every(validation => validation.activeGeneration)
  )
}

function assessmentCreateDisabled(input: {
  ready: boolean
  isPending: boolean
  remote: boolean
  subjectRevisionId: string
  subjectDigest: string
  authority: string
}) {
  return (
    !input.ready ||
    input.isPending ||
    (input.remote
      ? !input.subjectRevisionId.trim()
      : !input.subjectDigest.startsWith('sha256:') || !input.authority.trim())
  )
}

function AssessmentPreparationControls({
  qualityPlanId,
  revisionId,
  revisionStatus,
  designHash,
  validations,
  targetKind,
}: Pick<
  QualityLifecycleControlsProps,
  'qualityPlanId' | 'revisionId' | 'revisionStatus' | 'designHash' | 'validations' | 'targetKind'
>) {
  const [environmentId, setEnvironmentId] = useState('')
  const [bindingsJson, setBindingsJson] = useState('[]')
  const [subjectDigest, setSubjectDigest] = useState('')
  const [authority, setAuthority] = useState('')
  const [subjectRevisionId, setSubjectRevisionId] = useState('')
  const [preflightToken, setPreflightToken] = useState<RemotePreflightToken | null>(null)
  const [preflightCompleted, setPreflightCompleted] = useState(false)
  const { isPending, run } = useMutation()
  const remote = targetKind === 'REMOTE_BLACK_BOX'
  const ready = preparationReady(revisionStatus, designHash, validations)
  const executableValidationCount = validations.filter(validation => validation.activeGeneration).length
  const subject = preparationSubject(remote, subjectRevisionId, subjectDigest, authority)
  const compact = () => ({
    qualityPlanId,
    revisionId,
    expectedDesignHash: designHash!,
    validationBindings: parseJson(bindingsJson, 'Validation bindings'),
    environmentId: environmentId.trim(),
    subject,
    runtime: { browserEngine: 'CHROMIUM' as const },
  })
  return (
    <LifecycleCard
      title="Assessment preparation"
      description="Resolve compact bindings through Appraise-owned preflight, then prepare the managed assessment. Raw realization JSON is not accepted."
    >
      <p className="text-sm text-muted-foreground">
        Historical validation status is informational. Executable readiness requires an active generation with its exact
        review-ready publication ({executableValidationCount} of {validations.length} available).
      </p>
      <div className="grid gap-3">
        <CompactBindingFields
          environmentId={environmentId}
          bindingsJson={bindingsJson}
          onEnvironmentIdChange={setEnvironmentId}
          onBindingsJsonChange={setBindingsJson}
          environmentLabel="Existing environment ID"
          environmentInputId="prepare-environment"
          bindingsLabel="Approved compact validation bindings JSON"
          bindingsInputId="prepare-bindings"
        />
        {remote ? (
          <>
            <RemoteScopeCreateButton
              disabled={!ready || !environmentId.trim() || isPending}
              onCreate={() =>
                createRemoteScopeFromBindings({
                  run,
                  qualityPlanId,
                  revisionId,
                  designHash,
                  bindingsJson,
                  environmentId,
                  onCreated: setSubjectRevisionId,
                })
              }
            />
            <RemoteScopeSubjectInput
              inputId="prepare-remote-subject"
              label="Remote evaluation scope subject ID"
              value={subjectRevisionId}
              onChange={setSubjectRevisionId}
            />
          </>
        ) : (
          <ArtifactSubjectInputs
            digest={subjectDigest}
            authority={authority}
            onDigestChange={setSubjectDigest}
            onAuthorityChange={setAuthority}
            digestLabel="Preparation subject digest"
            authorityLabel="Preparation subject authority"
          />
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={preflightDisabled({
            ready,
            environmentId,
            isPending,
            remote,
            subjectRevisionId,
            subjectDigest,
            authority,
          })}
          onClick={() =>
            runAssessmentPreflight({
              run,
              compact,
              onCompleted: token => {
                setPreflightCompleted(true)
                setPreflightToken(token)
              },
            })
          }
        >
          Run preflight
        </Button>
        <Button
          type="button"
          disabled={!preflightCompleted || (remote && !preflightToken) || isPending}
          onClick={() =>
            run('Managed assessment prepared', () =>
              assessmentPrepareAction({
                ...compact(),
                ...(remote && preflightToken
                  ? {
                      expectedPreflight: {
                        algorithmVersion: preflightToken.algorithmVersion,
                        preflightHash: preflightToken.preflightHash,
                      },
                    }
                  : {}),
                idempotencyKey: idempotencyKey('prepare'),
              }),
            )
          }
        >
          Prepare and launch
        </Button>
      </div>
      {preflightToken ? (
        <div className="grid gap-1">
          <HashHint label="Preflight algorithm" value={preflightToken.algorithmVersion} />
          <HashHint label="Scope intent hash" value={preflightToken.scopeIntentHash} />
          <HashHint label="Realization intent hash" value={preflightToken.realizationIntentHash} />
          <HashHint label="Preflight hash" value={preflightToken.preflightHash} />
        </div>
      ) : null}
    </LifecycleCard>
  )
}

function AssessmentCreateControls({
  qualityPlanId,
  revisionId,
  revisionStatus,
  validations,
  targetKind,
  designHash,
}: Pick<
  QualityLifecycleControlsProps,
  'qualityPlanId' | 'revisionId' | 'revisionStatus' | 'validations' | 'targetKind' | 'designHash'
>) {
  const [subjectDigest, setSubjectDigest] = useState('')
  const [authority, setAuthority] = useState('')
  const [subjectRevisionId, setSubjectRevisionId] = useState('')
  const [baselineAssessmentId, setBaselineAssessmentId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [bindingsJson, setBindingsJson] = useState('[]')
  const { isPending, run } = useMutation()
  const readyForAssessment = assessmentReady(revisionStatus, validations)
  const remote = targetKind === 'REMOTE_BLACK_BOX'
  return (
    <LifecycleCard
      title="Create Assessment"
      description={
        remote
          ? 'Create an Appraise-owned remote evaluation scope from approved compact bindings, then bind its subject revision. This asserts evaluation scope only; target content identity is not asserted.'
          : 'Bind the published validation matrix to an immutable subject before execution and evidence review.'
      }
    >
      <div className="grid gap-3">
        {remote ? (
          <div className="space-y-3">
            <CompactBindingFields
              environmentId={environmentId}
              bindingsJson={bindingsJson}
              onEnvironmentIdChange={setEnvironmentId}
              onBindingsJsonChange={setBindingsJson}
              environmentLabel="Existing environment ID"
              environmentInputId="assessment-remote-environment"
              bindingsLabel="Approved compact validation bindings JSON"
              bindingsInputId="assessment-remote-bindings"
              bindingsClassName="min-h-40 font-mono text-xs"
            />
            <RemoteScopeCreateButton
              disabled={isPending || !designHash || !environmentId.trim()}
              onCreate={() =>
                createRemoteScopeFromBindings({
                  run,
                  qualityPlanId,
                  revisionId,
                  designHash,
                  bindingsJson,
                  environmentId,
                  onCreated: setSubjectRevisionId,
                  detailedError: true,
                })
              }
            />
            <RemoteScopeSubjectInput
              inputId="assessment-remote-scope-subject"
              label="Remote evaluation scope subject ID"
              placeholder="Created by evaluation_subject_remote_scope_create"
              value={subjectRevisionId}
              onChange={setSubjectRevisionId}
            />
            <p className="text-xs text-muted-foreground">
              Use the scope-create flow with approved bindings and an existing environment. Do not paste a deployment,
              URL, authority, or content digest here.
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
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
        disabled={assessmentCreateDisabled({
          ready: readyForAssessment,
          isPending,
          remote,
          subjectRevisionId,
          subjectDigest,
          authority,
        })}
        onClick={() =>
          run('Assessment created', () =>
            createQualityAssessmentAction({
              qualityPlanId,
              revisionId,
              idempotencyKey: idempotencyKey('assessment'),
              baselineAssessmentId: baselineAssessmentId.trim() || undefined,
              subject: remote
                ? { subjectRevisionId: subjectRevisionId.trim() }
                : { subjectDigest, authority, subjectKind: 'ARTIFACT' },
            }),
          )
        }
        type="button"
      >
        Create Assessment
      </Button>
      {!readyForAssessment ? (
        <p className="mt-3 text-sm text-amber-200">
          Every validation needs a supported active generation and its exact review-ready publication before creating an
          executable Assessment. A historical Published status alone is not sufficient.
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
