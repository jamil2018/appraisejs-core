'use client'

import { ArrowRight, Check, ChevronLeft, ClipboardCheck } from 'lucide-react'
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

const glassPanelClassName =
  'border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.026)_46%,rgba(255,255,255,0.014)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-18px_36px_rgba(0,0,0,0.12),0_18px_50px_-38px_rgba(0,0,0,0.8)] backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-card'
const liquidGlassButtonClassName =
  'rounded-full border border-white/[0.11] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.025),0_10px_24px_-18px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-[transform,background-color,border-color,box-shadow] hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-foreground active:translate-y-px active:scale-[0.985]'
const liquidGlassPrimaryButtonClassName =
  'rounded-full border border-white/[0.15] [background-color:rgba(28,32,39,0.58)] bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)),linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.055))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.2),0_10px_24px_-18px_hsl(var(--primary)/0.48)] backdrop-blur-2xl transition-[transform,filter,border-color,box-shadow] hover:border-white/[0.22] hover:brightness-110 active:translate-y-px active:scale-[0.985] supports-[not(backdrop-filter:blur(1px))]:[background-color:rgb(38,42,49)]'

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

const intakeStepMarkerClassNames = {
  complete:
    'border-primary/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04)),linear-gradient(135deg,hsl(var(--primary)/0.72),hsl(var(--primary)/0.38))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_hsl(var(--primary)/0.18),0_0_16px_-5px_hsl(var(--primary)/0.8)]',
  current:
    'ring-primary/10 border-primary/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)),linear-gradient(135deg,hsl(var(--primary)/0.3),hsl(var(--primary)/0.12))] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_0_14px_-6px_hsl(var(--primary)/0.75)] ring-4',
  upcoming:
    'border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018))] text-muted-foreground',
} as const

type IntakeStepState = keyof typeof intakeStepMarkerClassNames

const intakeStepStates = {
  '00': { button: 'upcoming', marker: 'upcoming' },
  '01': { button: 'complete', marker: 'complete' },
  '10': { button: 'current', marker: 'current' },
  '11': { button: 'current', marker: 'complete' },
} as const satisfies Record<string, { button: IntakeStepState; marker: IntakeStepState }>

function IntakeGuideStep({
  index,
  isLast,
  item,
  onSelect,
  currentStep,
}: {
  index: number
  isLast: boolean
  item: ReturnType<typeof intakeSteps>[number]
  onSelect: (step: number) => void
  currentStep: number
}) {
  const isCurrent = currentStep === index
  const isComplete = item.complete
  const stepNumber = String(index + 1).padStart(2, '0')
  const stateKey = `${Number(isCurrent)}${Number(isComplete)}` as keyof typeof intakeStepStates
  const state = intakeStepStates[stateKey]

  return (
    <li className="relative flex min-h-12 items-start">
      <span
        aria-hidden="true"
        className={`absolute -bottom-1 left-[11px] top-7 w-0.5 rounded-full transition-colors ${
          isComplete ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.55)]' : 'bg-white/10'
        } ${isLast ? 'hidden' : ''}`}
      />
      <button
        aria-current={isCurrent ? 'step' : undefined}
        aria-describedby={isComplete ? `intake-step-${index + 1}-status` : undefined}
        className="group flex w-full items-start gap-3 rounded-lg py-1 pr-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[current=step]:font-medium aria-[current=step]:text-foreground"
        data-state={state.button}
        onClick={() => onSelect(index)}
        type="button"
      >
        <span
          className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.12),0_5px_14px_-8px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-[color,background-color,border-color,box-shadow] ${intakeStepMarkerClassNames[state.marker]}`}
        >
          {isComplete ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /> : stepNumber}
          {isComplete ? <span className="sr-only">{stepNumber}</span> : null}
        </span>
        <span className="pt-0.5 leading-5">{item.label}</span>
      </button>
      {isComplete ? (
        <span className="sr-only" id={`intake-step-${index + 1}-status`}>
          Complete
        </span>
      ) : null}
    </li>
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
      <div className={`${glassPanelClassName} relative overflow-hidden rounded-xl p-4`}>
        <div
          aria-hidden="true"
          className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r via-white/25 to-transparent"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Your brief</p>
          <span className="font-mono text-xs text-muted-foreground">
            Step {currentStep + 1} of {items.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Complete the four inputs required for review.</p>
        <nav aria-label="Requirement intake sections" className="mt-5">
          <ol>
            {items.map((item, index) => (
              <IntakeGuideStep
                currentStep={currentStep}
                index={index}
                isLast={index === items.length - 1}
                item={item}
                key={item.label}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </nav>
      </div>
      <div className={`${glassPanelClassName} mt-3 rounded-xl px-4 py-3 text-xs leading-5 text-muted-foreground`}>
        <p>These answers tell AppraiseJS what to test and how to decide whether it worked.</p>
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
    <div className="flex flex-col gap-4 border-t border-white/[0.07] bg-white/[0.02] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:flex-row sm:items-center sm:justify-between sm:px-7">
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
          <Button
            className={liquidGlassButtonClassName}
            disabled={isPending}
            onClick={onBack}
            type="button"
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" className="mr-2 size-4" /> Back
          </Button>
        ) : null}
        {isLastStep ? (
          <Button
            className={`${liquidGlassPrimaryButtonClassName} shrink-0`}
            disabled={isPending}
            onClick={onReview}
            type="button"
          >
            <ClipboardCheck aria-hidden="true" className="mr-2 size-4" />
            Review Journey intake
          </Button>
        ) : (
          <Button
            className={`${liquidGlassPrimaryButtonClassName} shrink-0`}
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
    <header className={`${glassPanelClassName} relative overflow-hidden rounded-xl px-5 py-6 sm:px-7`}>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_68%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
      />
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
            <Button
              className={liquidGlassButtonClassName}
              onClick={() => window.location.reload()}
              size="sm"
              type="button"
              variant="outline"
            >
              Load saved version
            </Button>
            <Button
              className={liquidGlassButtonClassName}
              onClick={onSaveAsNewDraft}
              size="sm"
              type="button"
              variant="outline"
            >
              Save my edits as a new draft
            </Button>
          </div>
        ) : null}
        {saveStatus === 'failed' ? (
          <Button
            className={`${liquidGlassButtonClassName} mt-3`}
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
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
  const { actions, isPending, requirement, saveConflict, saveStatus, state, update, updateView } =
    useQualityJourneyCreateIntake({
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
        <Button
          className={`${liquidGlassPrimaryButtonClassName} mt-4`}
          disabled={isPending}
          onClick={actions.restore}
          type="button"
        >
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
        onEditIntake={() => updateView({ reviewing: false })}
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
          onSelect={step => updateView({ currentStep: step })}
          requirement={requirement}
        />
        <div className={`${glassPanelClassName} overflow-hidden rounded-xl`}>
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
              description="Add the behaviors to cover and the visible results that will count as success."
              id="intake-scope"
              title="Scope and success"
            >
              <ScopeIntakeScreen {...state} update={update} />
            </IntakeSection>
          </StepVisibility>
          <StepVisibility current={state.currentStep} when={2}>
            <IntakeSection
              description="Choose how deeply AppraiseJS should validate the end-to-end flow."
              id="intake-profile"
              title="Coverage"
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
            onBack={() => updateView({ currentStep: state.currentStep - 1 })}
            onContinue={() => updateView({ currentStep: state.currentStep + 1 })}
            onReview={actions.review}
            requirement={requirement}
          />
        </div>
      </div>
    </div>
  )
}
