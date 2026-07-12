'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Clock, FileCheck2, MessageSquare, ShieldCheck, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type ActionResult = { success?: boolean; error?: string }
type ValidationArtifact = NonNullable<PlanReviewDetail['validation']>
type ValidationNode = ValidationArtifact['validations'][number]
type ValidationAppraiseArtifacts = ValidationNode['appraiseArtifacts']
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
  run: (
    operation: () => Promise<ActionResult>,
    successMessage: string,
    options?: { recovery?: 'validation-drift' },
  ) => void
  onDecideValidation: (validationId: string, decision: 'approved' | 'rejected' | 'deferred') => Promise<ActionResult>
  onApproveFile: (path: string) => Promise<ActionResult>
  onSubmitReview: () => Promise<ActionResult>
  onCancelBaseline: () => Promise<ActionResult>
  onAcceptBaseline: () => Promise<ActionResult>
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
  if (lifecycle === 'validations_approved') {
    return 'Validations are approved. The connected agent starts required baselines through MCP.'
  }
  if (lifecycle === 'validation_changes_requested') {
    return 'Validation changes were requested. Republish updated validation artifacts before approval.'
  }
  if (lifecycle !== 'awaiting_validation_review') return 'The plan is not awaiting validation review.'
  return reviewState.readiness.ready ? null : reviewState.readiness.blockers.join(' ')
}

function submitButtonLabel(lifecycle: string): string {
  if (lifecycle === 'validations_approved') return 'Validation review approved'
  if (lifecycle === 'validation_changes_requested') return 'Waiting for updated validations'
  return 'Submit validation review'
}

function baselineActionDescription(lifecycle: string): string | null {
  if (lifecycle === 'validations_approved' || lifecycle === 'baseline_changes_requested') {
    return 'Validation review is approved. The connected agent starts required baselines through MCP.'
  }
  if (lifecycle === 'baseline_running') {
    return 'Baseline runs are active. The connected agent reconciles run evidence through MCP.'
  }
  if (lifecycle === 'baseline_review') return 'Baseline evidence is ready for acceptance.'
  if (lifecycle === 'baseline_accepted') {
    return 'Baseline evidence is accepted. The connected agent unlocks implementation through MCP.'
  }
  return null
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

function AppraiseArtifactSummary({ artifacts }: { artifacts?: ValidationAppraiseArtifacts }) {
  if (!artifacts) return null

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div>
        <h5 className="text-sm font-semibold">AppraiseJS artifacts</h5>
        <div className="mt-2 grid gap-3 text-sm md:grid-cols-3">
          <Info label="Modules" value={artifacts.modules.map(module => module.name).join(', ') || 'None'} />
          <Info
            label="Test suites"
            value={artifacts.testSuites.map(suite => `${suite.name} (${suite.testCaseIds.length})`).join(', ')}
          />
          <Info label="Locators" value={artifacts.locators.map(locator => locator.name).join(', ') || 'None'} />
        </div>
      </div>
      <div className="space-y-3">
        {artifacts.testCases.map(testCase => (
          <div key={testCase.id} className="space-y-2">
            <div>
              <p className="font-medium">{testCase.title}</p>
              <p className="text-sm text-muted-foreground">{testCase.description}</p>
            </div>
            <ol className="space-y-2">
              {testCase.steps.map(step => (
                <li key={step.id} className="grid gap-2 text-sm md:grid-cols-[3rem_minmax(0,1fr)]">
                  <span className="font-mono text-xs text-muted-foreground">#{step.order + 1}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <p className="break-words font-mono text-xs text-muted-foreground">{step.gherkinStep}</p>
                    {step.templateStepName || step.parameters.length ? (
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {[step.templateStepName, ...step.parameters.map(param => `${param.name}: ${param.value}`)]
                          .filter(Boolean)
                          .join(' | ')}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

function BaselineLifecycleActions({
  lifecycle,
  isPending,
  run,
  onCancelBaseline,
  onAcceptBaseline,
}: {
  lifecycle: string
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onCancelBaseline: ValidationReviewPanelProps['onCancelBaseline']
  onAcceptBaseline: ValidationReviewPanelProps['onAcceptBaseline']
}) {
  const description = baselineActionDescription(lifecycle)
  if (!description) return null

  return (
    <div className="mt-4 rounded-md border p-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {lifecycle === 'baseline_running' ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => run(onCancelBaseline, 'Baseline execution cancelled.')}
          >
            Cancel baseline runs
          </Button>
        ) : null}
        {lifecycle === 'baseline_review' ? (
          <Button type="button" disabled={isPending} onClick={() => run(onAcceptBaseline, 'Baselines accepted.')}>
            Accept complete baseline
          </Button>
        ) : null}
      </div>
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
  onCancelBaseline,
  onAcceptBaseline,
}: {
  detail: PlanReviewDetail
  validation: ValidationArtifact
  reviewState: ValidationReviewState
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onSubmitReview: ValidationReviewPanelProps['onSubmitReview']
  onCancelBaseline: ValidationReviewPanelProps['onCancelBaseline']
  onAcceptBaseline: ValidationReviewPanelProps['onAcceptBaseline']
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
      ) : detail.plan.lifecycle === 'awaiting_validation_review' ? (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          Validation evidence is ready. Submitting the validation review emits validations_approved and unlocks baseline
          actions.
        </div>
      ) : null}
      <div className="mt-4">
        <Button
          type="button"
          disabled={isPending || Boolean(disabledReason)}
          aria-describedby={disabledReason ? 'validation-submit-disabled-reason' : undefined}
          onClick={() => run(onSubmitReview, 'Validation review approved. Baseline is now available.')}
        >
          <ShieldCheck className="mr-2 size-4" />
          {submitButtonLabel(detail.plan.lifecycle)}
        </Button>
        {disabledReason ? (
          <p id="validation-submit-disabled-reason" className="mt-2 text-sm text-muted-foreground">
            {disabledReason}
          </p>
        ) : null}
      </div>
      <BaselineLifecycleActions
        lifecycle={detail.plan.lifecycle}
        isPending={isPending}
        run={run}
        onCancelBaseline={onCancelBaseline}
        onAcceptBaseline={onAcceptBaseline}
      />
    </div>
  )
}

function CollapseToggle({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="mt-0.5 size-7 shrink-0"
      onClick={onToggle}
      aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
    >
      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
    </Button>
  )
}

// fallow-ignore-next-line complexity
function ValidationNodeCard({
  node,
  hash,
  currentDecision,
  canDecide,
  isPending,
  run,
  onDecideValidation,
  onFeedbackTarget,
  isExpanded,
  onToggle,
}: {
  node: ValidationNode
  hash: string
  currentDecision?: ValidationDecision
  canDecide: boolean
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onDecideValidation: ValidationReviewPanelProps['onDecideValidation']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const decide = (decision: 'approved' | 'rejected' | 'deferred') =>
    run(() => onDecideValidation(node.id, decision), `Validation ${node.id} ${decision}.`)
  const hasExactV2Provenance = node.astProvenance?.schemaVersion === '2'
  const controlsLocked = isPending || !canDecide || !hasExactV2Provenance

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-sm transition-all duration-200',
        isExpanded ? 'border-muted-foreground/20' : 'hover:border-muted-foreground/20',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <CollapseToggle isExpanded={isExpanded} onToggle={onToggle} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="truncate font-mono text-sm font-semibold">
                <button
                  type="button"
                  className="truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={onToggle}
                  aria-expanded={isExpanded}
                >
                  {node.id}
                </button>
              </h4>
              <Badge variant={node.required ? 'destructive' : 'outline'} className="px-1.5 py-0 text-[10px]">
                {node.required ? 'Required' : 'Optional'}
              </Badge>
              <Badge variant={decisionVariant(currentDecision?.decision)} className="px-1.5 py-0 text-[10px]">
                {currentDecision?.decision ? formatState(currentDecision.decision) : 'No decision'}
              </Badge>
              <Badge variant={hasExactV2Provenance ? 'default' : 'destructive'} className="px-1.5 py-0 text-[10px]">
                {hasExactV2Provenance ? 'v2 AST' : 'Invalid provenance'}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{hash}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={controlsLocked || currentDecision?.decision === 'approved'}
            onClick={() => decide('approved')}
            aria-label={currentDecision?.decision === 'approved' ? 'Approved evidence' : 'Approve evidence'}
          >
            <Check className="mr-1 size-3" />
            {currentDecision?.decision === 'approved' ? 'Approved' : 'Approve'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={controlsLocked || node.required || currentDecision?.decision === 'deferred'}
            onClick={() => decide('deferred')}
          >
            <Clock className="mr-1 size-3" />
            {currentDecision?.decision === 'deferred' ? 'Deferred' : 'Defer'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={controlsLocked || node.required || currentDecision?.decision === 'rejected'}
            onClick={() => decide('rejected')}
          >
            <XCircle className="mr-1 size-3" />
            {currentDecision?.decision === 'rejected' ? 'Rejected' : 'Reject'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onFeedbackTarget({ type: 'validation', validationId: node.id })}
          >
            <MessageSquare className="mr-1 size-3" />
            Feedback
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4 border-t pt-4 duration-200 animate-in fade-in">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Info label="Task IDs" value={node.taskIds.join(', ')} />
            <Info label="Test cases" value={node.testCaseIds.join(', ')} />
          </div>
          <AppraiseArtifactSummary artifacts={node.appraiseArtifacts} />
          {hasExactV2Provenance ? (
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <Info label="Publish operation" value={node.astProvenance.publishOperationId} />
              <Info label="AST hash" value={node.astProvenance.astHash} />
              <Info label="Receipt hash" value={node.astProvenance.receiptHash} />
              <Info label="Runtime input hash" value={node.astProvenance.runtimeInputHash} />
            </div>
          ) : null}
          <div className="grid gap-3 text-sm md:grid-cols-2">
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
                  ? node.expectedFailures
                      .map(item => `${item.browser}/${item.environment}: ${item.signature}`)
                      .join(' | ')
                  : 'None'
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ValidationNodeList({
  validation,
  reviewState,
  decisions,
  canDecide,
  isPending,
  run,
  onDecideValidation,
  onFeedbackTarget,
}: {
  validation: ValidationArtifact
  reviewState: ValidationReviewState
  decisions: Map<string, ValidationDecision>
  canDecide: boolean
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onDecideValidation: ValidationReviewPanelProps['onDecideValidation']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
}) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  const allExpanded = validation.validations.length > 0 && validation.validations.every(node => expandedNodes[node.id])

  const toggleAll = () => {
    const nextState: Record<string, boolean> = {}
    validation.validations.forEach(node => {
      nextState[node.id] = !allExpanded
    })
    setExpandedNodes(nextState)
  }

  return (
    <section className="space-y-3" aria-labelledby="validation-nodes-heading">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 id="validation-nodes-heading" className="text-sm font-semibold uppercase text-muted-foreground">
          Validation nodes
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={toggleAll}
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>
      <div className="space-y-3">
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
              canDecide={canDecide}
              isPending={isPending}
              run={run}
              onDecideValidation={onDecideValidation}
              onFeedbackTarget={onFeedbackTarget}
              isExpanded={!!expandedNodes[node.id]}
              onToggle={() => setExpandedNodes(prev => ({ ...prev, [node.id]: !prev[node.id] }))}
            />
          )
        })}
      </div>
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
  isExpanded,
  onToggle,
}: {
  file: ChangedFile
  hash: string
  approved: boolean
  inManifest: boolean
  isPending: boolean
  run: ValidationReviewPanelProps['run']
  onApproveFile: ValidationReviewPanelProps['onApproveFile']
  onFeedbackTarget: (target: ValidationFeedbackTarget) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const requiresApproval = fileNeedsApproval(file)

  let statusBorderClass = 'border-slate-200 bg-card'
  if (requiresApproval) {
    statusBorderClass = approved
      ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
      : 'border-red-500/30 bg-red-500/5 dark:bg-red-500/10'
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 shadow-sm transition-all duration-200',
        statusBorderClass,
        isExpanded ? 'border-muted-foreground/20' : 'hover:border-muted-foreground/20',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <CollapseToggle isExpanded={isExpanded} onToggle={onToggle} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-all font-mono text-sm font-semibold">
                <button
                  type="button"
                  className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={onToggle}
                  aria-expanded={isExpanded}
                >
                  {file.path}
                </button>
              </h4>
              <Badge variant={requiresApproval ? 'destructive' : 'outline'} className="px-1.5 py-0 text-[10px]">
                {formatState(file.classification)}
              </Badge>
              <Badge variant={file.declared ? 'secondary' : 'destructive'} className="px-1.5 py-0 text-[10px]">
                {file.declared ? 'Declared' : 'Undeclared'}
              </Badge>
              <Badge variant={inManifest ? 'secondary' : 'destructive'} className="px-1.5 py-0 text-[10px]">
                {inManifest ? 'In manifest' : 'Manifest mismatch'}
              </Badge>
              <Badge
                variant={approved ? 'default' : requiresApproval ? 'destructive' : 'outline'}
                className="px-1.5 py-0 text-[10px]"
              >
                {requiresApproval ? (approved ? 'Approved' : 'Approval required') : 'No approval required'}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{file.rationale}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {requiresApproval && (
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={isPending || approved}
              onClick={() => run(() => onApproveFile(file.path), `File ${file.path} approved.`)}
            >
              <FileCheck2 className="mr-1 size-3" />
              Approve file
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onFeedbackTarget({ type: 'file', path: file.path })}
          >
            <MessageSquare className="mr-1 size-3" />
            Feedback
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 grid gap-3 border-t pt-4 text-sm duration-200 animate-in fade-in md:grid-cols-3">
          <Info label="Status" value={formatState(file.status)} />
          <Info label="Before hash" value={file.beforeHash ?? 'New file'} />
          <Info label="Current hash" value={file.contentHash ?? hash} />
        </div>
      )}
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
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})

  const allExpanded = validation.files.length > 0 && validation.files.every(file => expandedFiles[file.path])

  const toggleAll = () => {
    const nextState: Record<string, boolean> = {}
    validation.files.forEach(file => {
      nextState[file.path] = !allExpanded
    })
    setExpandedFiles(nextState)
  }

  return (
    <section className="space-y-3" aria-labelledby="changed-files-heading">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 id="changed-files-heading" className="text-sm font-semibold uppercase text-muted-foreground">
          Changed-file evidence
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={toggleAll}
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>
      <div className="space-y-3">
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
              isExpanded={!!expandedFiles[file.path]}
              onToggle={() => setExpandedFiles(prev => ({ ...prev, [file.path]: !prev[file.path] }))}
            />
          )
        })}
      </div>
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
        type="button"
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
  onCancelBaseline,
  onAcceptBaseline,
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
  const canDecideValidation = detail.plan.lifecycle === 'awaiting_validation_review'

  return (
    <div className="space-y-5 p-5">
      <ValidationSummary
        detail={detail}
        validation={validation}
        reviewState={reviewState}
        isPending={isPending}
        run={run}
        onSubmitReview={onSubmitReview}
        onCancelBaseline={onCancelBaseline}
        onAcceptBaseline={onAcceptBaseline}
      />
      <ValidationNodeList
        validation={validation}
        reviewState={reviewState}
        decisions={decisions}
        canDecide={canDecideValidation}
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
