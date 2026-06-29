'use client'

import { useMemo, useState } from 'react'
import { Check, Clock, FileCheck2, MessageSquare, ShieldCheck, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type ActionResult = { success?: boolean; error?: string }
type ValidationArtifact = NonNullable<PlanReviewDetail['validation']>
type ValidationNode = ValidationArtifact['validations'][number]
type ChangedFile = ValidationArtifact['files'][number]
type ValidationReviewState = NonNullable<PlanReviewDetail['validationReview']>
type ValidationDecision = ValidationArtifact['validationDecisions'][number]
type ValidationFeedbackTarget =
  | { type: 'validation'; validationId: string }
  | { type: 'file'; path: string }
  | { type: 'plan' }
type FeedbackScope = 'test_artifact' | 'product_scope'

type ValidationReviewPanelProps = {
  detail: PlanReviewDetail
  isPending: boolean
  run: (operation: () => Promise<ActionResult>, successMessage: string) => void
  onDecideValidation: (validationId: string, decision: 'approved' | 'rejected' | 'deferred') => Promise<ActionResult>
  onApproveFile: (path: string) => Promise<ActionResult>
  onSubmitReview: () => Promise<ActionResult>
  onSubmitFeedback: (input: {
    scope: FeedbackScope
    target: ValidationFeedbackTarget
    body: string
    affectedValidationIds?: string[]
    affectedFilePaths?: string[]
  }) => Promise<ActionResult>
}

function formatState(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}

function decisionVariant(decision?: string) {
  if (decision === 'approved') return 'default'
  if (decision === 'rejected') return 'destructive'
  return 'outline'
}

function fileNeedsApproval(file: ChangedFile): boolean {
  return file.classification === 'production' || file.classification === 'requires_review'
}

function submitDisabledReason(lifecycle: string, reviewState: ValidationReviewState): string | null {
  if (lifecycle === 'validations_approved')
    return 'Validations are already approved. Baseline controls are available separately.'
  if (lifecycle !== 'awaiting_validation_review') return 'The plan is not awaiting validation review.'
  return reviewState.readiness.ready ? null : reviewState.readiness.blockers.join(' ')
}

function feedbackTargetLabel(target: ValidationFeedbackTarget): string {
  if (target.type === 'validation') return target.validationId
  if (target.type === 'file') return target.path
  return 'plan'
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-xs">{value}</p>
    </div>
  )
}

function ValidationSummary({
  detail,
  validation,
  reviewState,
  isPending,
  run,
  onSubmitReview,
}: {
  detail: PlanReviewDetail
  validation: ValidationArtifact
  reviewState: ValidationReviewState
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onSubmitReview: ValidationReviewPanelProps['onSubmitReview']
}) {
  const disabledReason = submitDisabledReason(detail.plan.lifecycle, reviewState)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Validation review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approval advances to validations approved. Implementation remains locked until baseline evidence is
            accepted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Revision {validation.revision}</Badge>
          <Badge variant={detail.plan.lifecycle === 'validations_approved' ? 'default' : 'secondary'}>
            {formatState(detail.plan.lifecycle)}
          </Badge>
          <Badge variant={validation.baselineDecision === 'accepted' ? 'default' : 'outline'}>
            Baseline {formatState(validation.baselineDecision)}
          </Badge>
        </div>
      </div>
      {reviewState.readiness.blockers.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {reviewState.readiness.blockers.map(blocker => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">
        <Button
          disabled={isPending || Boolean(disabledReason)}
          aria-describedby={disabledReason ? 'validation-submit-disabled-reason' : undefined}
          onClick={() => run(onSubmitReview, 'Validation review approved. Baseline is now available.')}
        >
          <ShieldCheck className="mr-2 size-4" />
          Submit validation review
        </Button>
        {disabledReason ? (
          <p id="validation-submit-disabled-reason" className="mt-2 text-sm text-muted-foreground">
            {disabledReason}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// fallow-ignore-next-line complexity
function ValidationNodeCard({
  node,
  hash,
  currentDecision,
  isPending,
  run,
  onDecideValidation,
  onFeedbackTarget,
}: {
  node: ValidationNode
  hash: string
  currentDecision?: ValidationDecision
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onDecideValidation: ValidationReviewPanelProps['onDecideValidation']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
}) {
  const decide = (decision: 'approved' | 'rejected' | 'deferred') =>
    run(() => onDecideValidation(node.id, decision), `Validation ${node.id} ${decision}.`)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-mono text-sm font-semibold">{node.id}</h4>
            <Badge variant={node.required ? 'destructive' : 'outline'}>{node.required ? 'Required' : 'Optional'}</Badge>
            <Badge variant={decisionVariant(currentDecision?.decision)}>
              {currentDecision?.decision ? formatState(currentDecision.decision) : 'No decision'}
            </Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{hash}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isPending} onClick={() => decide('approved')}>
            <Check className="mr-1 size-3.5" />
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={isPending || node.required} onClick={() => decide('deferred')}>
            <Clock className="mr-1 size-3.5" />
            Defer
          </Button>
          <Button size="sm" variant="outline" disabled={isPending || node.required} onClick={() => decide('rejected')}>
            <XCircle className="mr-1 size-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFeedbackTarget({ type: 'validation', validationId: node.id })}
          >
            <MessageSquare className="mr-1 size-3.5" />
            Feedback
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <Info label="Task IDs" value={node.taskIds.join(', ')} />
        <Info
          label="Executable"
          value={`${node.executable.path}${node.executable.selector ? ` :: ${node.executable.selector}` : ''}`}
        />
        <Info label="Gherkin" value={node.gherkinPaths.join(', ')} />
        <Info label="Steps" value={node.stepPaths.join(', ')} />
        <Info label="Matrix" value={node.matrix.map(item => `${item.browser}/${item.environment}`).join(', ')} />
        <Info
          label="Expected failures"
          value={
            node.expectedFailures.length
              ? node.expectedFailures.map(item => `${item.browser}/${item.environment}: ${item.signature}`).join(' | ')
              : 'None'
          }
        />
      </div>
    </div>
  )
}

function ValidationNodeList({
  validation,
  reviewState,
  decisions,
  isPending,
  run,
  onDecideValidation,
  onFeedbackTarget,
}: {
  validation: ValidationArtifact
  reviewState: ValidationReviewState
  decisions: Map<string, ValidationDecision>
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onDecideValidation: ValidationReviewPanelProps['onDecideValidation']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
}) {
  return (
    <section className="space-y-3" aria-labelledby="validation-nodes-heading">
      <h3 id="validation-nodes-heading" className="text-sm font-semibold uppercase text-muted-foreground">
        Validation nodes
      </h3>
      {validation.validations.map(node => {
        const hash = reviewState.nodeHashes[node.id]
        const decision = decisions.get(node.id)
        const currentDecision = decision?.contentHash === hash ? decision : undefined
        return (
          <ValidationNodeCard
            key={node.id}
            node={node}
            hash={hash}
            currentDecision={currentDecision}
            isPending={isPending}
            run={run}
            onDecideValidation={onDecideValidation}
            onFeedbackTarget={onFeedbackTarget}
          />
        )
      })}
    </section>
  )
}

// fallow-ignore-next-line complexity
function ChangedFileCard({
  file,
  hash,
  approved,
  inManifest,
  isPending,
  run,
  onApproveFile,
  onFeedbackTarget,
}: {
  file: ChangedFile
  hash: string
  approved: boolean
  inManifest: boolean
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onApproveFile: ValidationReviewPanelProps['onApproveFile']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
}) {
  const requiresApproval = fileNeedsApproval(file)

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-all font-mono text-sm font-semibold">{file.path}</h4>
            <Badge variant={requiresApproval ? 'destructive' : 'outline'}>{formatState(file.classification)}</Badge>
            <Badge variant={file.declared ? 'secondary' : 'destructive'}>
              {file.declared ? 'Declared' : 'Undeclared'}
            </Badge>
            <Badge variant={inManifest ? 'secondary' : 'destructive'}>
              {inManifest ? 'In manifest' : 'Manifest mismatch'}
            </Badge>
            <Badge variant={approved ? 'default' : requiresApproval ? 'destructive' : 'outline'}>
              {requiresApproval ? (approved ? 'Approved' : 'Approval required') : 'No approval required'}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{file.rationale}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {requiresApproval ? (
            <Button
              size="sm"
              disabled={isPending || approved}
              onClick={() => run(() => onApproveFile(file.path), `File ${file.path} approved.`)}
            >
              <FileCheck2 className="mr-1 size-3.5" />
              Approve file
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => onFeedbackTarget({ type: 'file', path: file.path })}>
            <MessageSquare className="mr-1 size-3.5" />
            Feedback
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <Info label="Status" value={formatState(file.status)} />
        <Info label="Before hash" value={file.beforeHash ?? 'New file'} />
        <Info label="Current hash" value={file.contentHash ?? hash} />
      </div>
    </div>
  )
}

function ChangedFileList({
  validation,
  reviewState,
  approvedFiles,
  manifest,
  isPending,
  run,
  onApproveFile,
  onFeedbackTarget,
}: {
  validation: ValidationArtifact
  reviewState: ValidationReviewState
  approvedFiles: Set<string>
  manifest: Set<string>
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onApproveFile: ValidationReviewPanelProps['onApproveFile']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
}) {
  return (
    <section className="space-y-3" aria-labelledby="changed-files-heading">
      <h3 id="changed-files-heading" className="text-sm font-semibold uppercase text-muted-foreground">
        Changed-file evidence
      </h3>
      {validation.files.map(file => {
        const hash = reviewState.fileHashes[file.path]
        return (
          <ChangedFileCard
            key={file.path}
            file={file}
            hash={hash}
            approved={approvedFiles.has(`${file.path}:${hash}`)}
            inManifest={manifest.has(file.path)}
            isPending={isPending}
            run={run}
            onApproveFile={onApproveFile}
            onFeedbackTarget={onFeedbackTarget}
          />
        )
      })}
    </section>
  )
}

function ValidationFeedbackForm({
  feedbackBody,
  feedbackScope,
  feedbackTarget,
  isPending,
  setFeedbackBody,
  setFeedbackScope,
  setFeedbackTarget,
  run,
  onSubmitFeedback,
}: {
  feedbackBody: string
  feedbackScope: FeedbackScope
  feedbackTarget: ValidationFeedbackTarget
  isPending: boolean
  setFeedbackBody: (value: string) => void
  setFeedbackScope: (scope: FeedbackScope) => void
  setFeedbackTarget: (target: ValidationFeedbackTarget) => void
  run: ValidationReviewPanelProps['run']
  onSubmitFeedback: ValidationReviewPanelProps['onSubmitFeedback']
}) {
  const submitTarget = feedbackScope === 'product_scope' ? { type: 'plan' as const } : feedbackTarget
  const affectedValidationIds = feedbackTarget.type === 'validation' ? [feedbackTarget.validationId] : undefined
  const affectedFilePaths = feedbackTarget.type === 'file' ? [feedbackTarget.path] : undefined

  return (
    <section className="rounded-lg border p-4" aria-labelledby="validation-feedback-heading">
      <h3 id="validation-feedback-heading" className="text-base font-semibold">
        Validation feedback
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Test-artifact feedback reopens validation review. Product-scope feedback returns the plan to plan review.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['test_artifact', 'product_scope'] as const).map(scope => (
          <Button
            key={scope}
            type="button"
            size="sm"
            variant={feedbackScope === scope ? 'default' : 'outline'}
            onClick={() => {
              setFeedbackScope(scope)
              if (scope === 'product_scope') setFeedbackTarget({ type: 'plan' })
            }}
          >
            {formatState(scope)}
          </Button>
        ))}
        <Badge variant="outline" className={cn('h-8 px-3 py-2', feedbackTarget.type === 'plan' && 'capitalize')}>
          Target {feedbackTargetLabel(feedbackTarget)}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="validation-feedback">Feedback</Label>
        <Textarea
          id="validation-feedback"
          value={feedbackBody}
          onChange={event => setFeedbackBody(event.target.value)}
          placeholder="Describe what needs to change in the validation evidence..."
        />
      </div>
      <Button
        className="mt-3"
        variant="outline"
        disabled={isPending || !feedbackBody.trim()}
        onClick={() =>
          run(
            () =>
              onSubmitFeedback({
                scope: feedbackScope,
                target: submitTarget,
                body: feedbackBody,
                affectedValidationIds,
                affectedFilePaths,
              }),
            'Validation feedback submitted.',
          )
        }
      >
        <MessageSquare className="mr-2 size-4" />
        Submit validation feedback
      </Button>
    </section>
  )
}

export function ValidationReviewPanel({
  detail,
  isPending,
  run,
  onDecideValidation,
  onApproveFile,
  onSubmitReview,
  onSubmitFeedback,
}: ValidationReviewPanelProps) {
  const validation = detail.validation
  const reviewState = detail.validationReview
  const [feedbackTarget, setFeedbackTarget] = useState<ValidationFeedbackTarget>({ type: 'plan' })
  const [feedbackBody, setFeedbackBody] = useState('')
  const [feedbackScope, setFeedbackScope] = useState<FeedbackScope>('test_artifact')

  const decisions = useMemo(
    () => new Map(validation?.validationDecisions.map(decision => [decision.validationId, decision]) ?? []),
    [validation?.validationDecisions],
  )
  const approvedFiles = useMemo(
    () => new Set(detail.review?.fileApprovals.map(approval => `${approval.path}:${approval.contentHash}`) ?? []),
    [detail.review?.fileApprovals],
  )
  const manifest = useMemo(() => new Set(validation?.manifestPaths ?? []), [validation?.manifestPaths])

  if (!validation || !reviewState) {
    return (
      <div className="p-5">
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No validation artifact has been published for this plan revision.
        </div>
      </div>
    )
  }

  const setValidationFeedbackTarget = (target: ValidationFeedbackTarget) => {
    setFeedbackScope('test_artifact')
    setFeedbackTarget(target)
  }

  return (
    <div className="space-y-5 p-5">
      <ValidationSummary
        detail={detail}
        validation={validation}
        reviewState={reviewState}
        isPending={isPending}
        run={run}
        onSubmitReview={onSubmitReview}
      />
      <ValidationNodeList
        validation={validation}
        reviewState={reviewState}
        decisions={decisions}
        isPending={isPending}
        run={run}
        onDecideValidation={onDecideValidation}
        onFeedbackTarget={setValidationFeedbackTarget}
      />
      <ChangedFileList
        validation={validation}
        reviewState={reviewState}
        approvedFiles={approvedFiles}
        manifest={manifest}
        isPending={isPending}
        run={run}
        onApproveFile={onApproveFile}
        onFeedbackTarget={setValidationFeedbackTarget}
      />
      <ValidationFeedbackForm
        feedbackBody={feedbackBody}
        feedbackScope={feedbackScope}
        feedbackTarget={feedbackTarget}
        isPending={isPending}
        setFeedbackBody={setFeedbackBody}
        setFeedbackScope={setFeedbackScope}
        setFeedbackTarget={setFeedbackTarget}
        run={run}
        onSubmitFeedback={onSubmitFeedback}
      />
    </div>
  )
}
