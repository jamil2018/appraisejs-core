'use client'

import { ArrowRight, ChevronLeft, ClipboardCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

import {
  ChecksIntakeScreen,
  EnvironmentIntakeScreen,
  GoalIntakeScreen,
  ScopeIntakeScreen,
} from './quality-journey-create-form-screens'
import {
  intakeSteps,
  StepVisibility,
  type DraftSnapshot,
  type EnvironmentOption,
  type Requirement,
} from './quality-journey-create-form-shared'
import { IntakeReview } from './quality-journey-intake-review'
import { useQualityJourneyCreateIntake } from './use-quality-journey-create-intake'

function IntakeSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode
  description: string
  id: string
  title: string
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="scroll-mt-6 px-5 py-6 sm:px-7 sm:py-7" id={id}>
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight" id={`${id}-heading`} tabIndex={-1}>
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function IntakeGuide({
  currentStep,
  onSelect,
  requirement,
}: {
  currentStep: number
  onSelect: (step: number) => void
  requirement: Requirement
}) {
  const items = intakeSteps(requirement)
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="border-border/80 bg-card/40 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Your brief</p>
          <span className="font-mono text-xs text-muted-foreground">
            Step {currentStep + 1} of {items.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Complete the four inputs required for review.</p>
        <nav
          aria-label="Requirement intake sections"
          className="mt-4 flex gap-1 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 xl:block xl:space-y-1"
        >
          {items.map((item, index) => (
            <button
              aria-current={currentStep === index ? 'step' : undefined}
              className="hover:bg-muted/60 aria-[current=step]:bg-primary/10 group flex min-w-36 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground aria-[current=step]:font-medium aria-[current=step]:text-foreground md:min-w-0 xl:text-sm"
              key={item.label}
              onClick={() => onSelect(index)}
              type="button"
            >
              <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="border-primary/20 bg-primary/[0.06] mt-3 rounded-xl border px-4 py-3 text-xs leading-5 text-muted-foreground">
        <p>Supplied answers become binding intent. The Analyzer asks only about gaps, conflicts, or feasibility.</p>
      </div>
    </aside>
  )
}

function WizardFooter({
  currentStep,
  error,
  isPending,
  onBack,
  onContinue,
  onReview,
  requirement,
}: {
  currentStep: number
  error: string | null
  isPending: boolean
  onBack: () => void
  onContinue: () => void
  onReview: () => void
  requirement: Requirement
}) {
  const steps = intakeSteps(requirement)
  const isLastStep = currentStep === steps.length - 1
  const stepComplete = steps[currentStep]?.complete ?? false
  return (
    <div className="bg-muted/15 flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          Step {currentStep + 1} of {steps.length}
        </p>
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {stepComplete ? 'This step is complete.' : 'Complete the required input to continue.'}
        </p>
        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {currentStep > 0 ? (
          <Button disabled={isPending} onClick={onBack} type="button" variant="ghost">
            <ChevronLeft aria-hidden="true" className="mr-2 size-4" /> Back
          </Button>
        ) : null}
        {isLastStep ? (
          <Button className="shrink-0 active:translate-y-px" disabled={isPending} onClick={onReview} type="button">
            <ClipboardCheck aria-hidden="true" className="mr-2 size-4" />
            Review Journey intake
          </Button>
        ) : (
          <Button
            className="shrink-0 active:translate-y-px"
            disabled={isPending || !stepComplete}
            onClick={onContinue}
            type="button"
          >
            Continue <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function IntakeHeader({
  predecessorJourneyId,
  saveConflict,
  saveStatus,
  onRetry,
  onSaveAsNewDraft,
}: {
  predecessorJourneyId?: string
  saveConflict: boolean
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'failed'
  onRetry: () => void
  onSaveAsNewDraft: () => void
}) {
  const message =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved to this workspace'
        : saveStatus === 'dirty'
          ? 'Unsaved changes—saving shortly.'
        : saveStatus === 'failed'
          ? 'Couldn’t save—Retry.'
          : 'Your brief will be saved to this workspace after your first edit.'
  return (
    <header className="border-primary/20 bg-card/50 relative overflow-hidden rounded-xl border px-5 py-6 sm:px-7">
      <div className="from-primary/[0.08] pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l to-transparent" />
      <div className="relative">
        <h2 className="text-lg font-semibold tracking-tight">Prepare a Quality Journey</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Shape the brief your coordinator will receive. Nothing is created until you review and confirm it.
          {predecessorJourneyId ? ` This Journey follows ${predecessorJourneyId}.` : null}
        </p>
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {message}
        </p>
        {saveConflict ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()} size="sm" type="button" variant="outline">
              Load saved version
            </Button>
            <Button onClick={onSaveAsNewDraft} size="sm" type="button" variant="outline">
              Save my edits as a new draft
            </Button>
          </div>
        ) : null}
        {saveStatus === 'failed' ? (
          <Button className="mt-3" onClick={onRetry} size="sm" type="button" variant="outline">
            Retry save
          </Button>
        ) : null}
      </div>
    </header>
  )
}

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
  initialEnvironments,
  draft,
}: {
  projectId: string
  predecessorJourneyId?: string
  initialEnvironments: EnvironmentOption[]
  draft?: DraftSnapshot
}) {
  const { push } = useRouter()
  const { actions, isPending, requirement, saveConflict, saveStatus, state, update } = useQualityJourneyCreateIntake({
    draft,
    initialEnvironments,
    predecessorJourneyId,
    projectId,
    push,
  })
  if (draft?.status === 'ARCHIVED')
    return (
      <section className="bg-card/40 rounded-xl border p-6">
        <h1 className="text-lg font-semibold">This draft is archived</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Restore it to continue editing. Archived drafts are never deleted automatically.
        </p>
        <Button className="mt-4" disabled={isPending} onClick={actions.restore} type="button">
          Restore draft
        </Button>
      </section>
    )
  if (state.reviewing)
    return (
      <IntakeReview
        environments={state.environments}
        error={state.error}
        isPending={isPending}
        onConfirm={actions.submit}
        onDiscard={actions.discard}
        onEdit={actions.editReviewSection}
        onEditIntake={() => update({ reviewing: false })}
        requirement={requirement}
      />
    )
  return (
    <div className="space-y-5">
      <IntakeHeader
        onRetry={() => void actions.enqueueSave()}
        onSaveAsNewDraft={actions.saveAsNewDraft}
        predecessorJourneyId={predecessorJourneyId}
        saveConflict={saveConflict}
        saveStatus={saveStatus}
      />
      <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <IntakeGuide
          currentStep={state.currentStep}
          onSelect={step => update({ currentStep: step })}
          requirement={requirement}
        />
        <div className="border-border/80 bg-card/30 overflow-hidden rounded-xl border">
          <StepVisibility current={state.currentStep} when={0}>
            <IntakeSection
              description="State the outcome or behavior that should be trusted when this Journey is complete."
              id="intake-requirement"
              title="Goal"
            >
              <GoalIntakeScreen {...state} update={update} />
            </IntakeSection>
          </StepVisibility>
          <StepVisibility current={state.currentStep} when={1}>
            <IntakeSection
              description="Draw the boundary clearly so analysis can protect what matters without inventing scope."
              id="intake-scope"
              title="Scope and success"
            >
              <ScopeIntakeScreen {...state} update={update} />
            </IntakeSection>
          </StepVisibility>
          <StepVisibility current={state.currentStep} when={2}>
            <IntakeSection
              description="Choose how deeply to investigate and which quality perspectives matter."
              id="intake-profile"
              title="Checks"
            >
              <ChecksIntakeScreen {...state} update={update} />
            </IntakeSection>
          </StepVisibility>
          <StepVisibility current={state.currentStep} when={3}>
            <IntakeSection
              description="Bind the brief to registered targets so the coordinator works from stable environment identities."
              id="intake-environment"
              title="Test location"
            >
              <EnvironmentIntakeScreen
                {...state}
                isPending={isPending}
                onRegister={actions.registerEnvironment}
                update={update}
              />
            </IntakeSection>
          </StepVisibility>
          <WizardFooter
            currentStep={state.currentStep}
            error={state.error}
            isPending={isPending}
            onBack={() => update({ currentStep: state.currentStep - 1 })}
            onContinue={() => update({ currentStep: state.currentStep + 1 })}
            onReview={actions.review}
            requirement={requirement}
          />
        </div>
      </div>
    </div>
  )
}
