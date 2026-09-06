'use client'

import { ArrowRight, Check, ChevronLeft, ClipboardCheck, Plus, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useReducer, useRef, useTransition, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import { createQualityJourneyAction, ensureQualityJourneyIntakeEnvironmentAction } from './quality-journey-actions'

type EnvironmentOption = { id: string; name: string; baseUrl: string }
type Dimension = (typeof dimensions)[number]['value']

const dimensions = [
  { value: 'FUNCTIONAL', label: 'Functional' },
  { value: 'END_TO_END', label: 'End-to-end' },
  { value: 'API', label: 'API' },
  { value: 'INTEGRATION', label: 'Integration' },
  { value: 'ACCESSIBILITY', label: 'Accessibility' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'VISUAL', label: 'Visual' },
  { value: 'COMPATIBILITY', label: 'Compatibility' },
  { value: 'EXPLORATORY', label: 'Exploratory' },
  { value: 'CUSTOM', label: 'Custom' },
] as const

const rigorDescriptions = {
  FOCUSED: 'Concentrate evidence on the named behavior and its closest failure paths.',
  STANDARD: 'Cover primary behavior, important alternatives, and representative risks.',
  COMPREHENSIVE: 'Seek broad coverage, edge conditions, and cross-feature regression evidence.',
} as const

function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function lines(value: string) {
  return value.split('\n').flatMap(item => {
    const trimmed = item.trim()
    return trimmed ? [trimmed] : []
  })
}

type IntakeValues = {
  objective: string
  context: string
  coverageRigor: keyof typeof rigorDescriptions
  testDimensions: Dimension[]
  includedScope: string
  excludedScope: string
  environmentIds: string[]
  actors: string
  testDataNeeds: string
  constraints: string
  risks: string
  desiredEvidenceSignals: string
}

function buildRequirement(values: IntakeValues) {
  const optionalList = (value: string) => {
    const items = lines(value)
    return items.length ? items : undefined
  }
  return {
    schemaVersion: 'appraise.quality-journey-requirement/v1' as const,
    objective: values.objective.trim(),
    context: values.context.trim() || undefined,
    coverageRigor: values.coverageRigor,
    testDimensions: values.testDimensions.toSorted(),
    includedScope: lines(values.includedScope),
    excludedScope: optionalList(values.excludedScope),
    environmentIds: values.environmentIds.toSorted(),
    actors: optionalList(values.actors),
    testDataNeeds: optionalList(values.testDataNeeds),
    constraints: optionalList(values.constraints),
    risks: optionalList(values.risks),
    desiredEvidenceSignals: lines(values.desiredEvidenceSignals),
  }
}

function missingRequiredIntake(requirement: ReturnType<typeof buildRequirement>) {
  const missing: string[] = []
  if (!requirement.objective) missing.push('a requirement objective')
  if (!requirement.testDimensions.length) missing.push('at least one test dimension')
  if (!requirement.includedScope.length) missing.push('at least one included scope item')
  if (!requirement.environmentIds.length) missing.push('at least one registered environment')
  if (!requirement.desiredEvidenceSignals.length) missing.push('at least one desired evidence signal')
  return missing
}

function journeyIdFrom(response: Awaited<ReturnType<typeof createQualityJourneyAction>>) {
  const data = response.success ? response.data : undefined
  if (!data || typeof data !== 'object' || !('journeyId' in data)) return null
  return typeof data.journeyId === 'string' ? data.journeyId : null
}

function environmentFrom(response: Awaited<ReturnType<typeof ensureQualityJourneyIntakeEnvironmentAction>>) {
  if (!response.success || !isRecord(response.data)) return null
  const environment = response.data.environment
  if (!isRecord(environment)) return null
  const id = stringProperty(environment, 'id')
  const name = stringProperty(environment, 'name')
  const baseUrl = stringProperty(environment, 'baseUrl')
  return id && name && baseUrl ? { id, name, baseUrl } : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringProperty(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

type IntakeState = IntakeValues & {
  currentStep: number
  reviewing: boolean
  environments: EnvironmentOption[]
  environmentName: string
  environmentUrl: string
  showEnvironmentForm: boolean
  error: string | null
}

type IntakeAction =
  { type: 'patch'; patch: Partial<IntakeState> } | { type: 'environment-registered'; environment: EnvironmentOption }

function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  if (action.type === 'patch') return { ...state, ...action.patch }
  const { environment } = action
  return {
    ...state,
    environments: [...state.environments.filter(item => item.id !== environment.id), environment],
    environmentIds: [...new Set([...state.environmentIds, environment.id])],
    environmentName: '',
    environmentUrl: '',
    showEnvironmentForm: false,
    error: null,
  }
}

function initialIntakeState(environments: EnvironmentOption[]): IntakeState {
  return {
    currentStep: 0,
    reviewing: false,
    objective: '',
    context: '',
    coverageRigor: 'STANDARD',
    testDimensions: ['FUNCTIONAL'],
    includedScope: '',
    excludedScope: '',
    desiredEvidenceSignals: '',
    actors: '',
    testDataNeeds: '',
    constraints: '',
    risks: '',
    environments,
    environmentIds: [],
    environmentName: '',
    environmentUrl: '',
    showEnvironmentForm: false,
    error: null,
  }
}

type IntakeSectionProps = {
  children: ReactNode
  complete: boolean
  description: string
  id: string
  title: string
}

function IntakeSection({ children, complete, description, id, title }: IntakeSectionProps) {
  return (
    <section className="scroll-mt-6 px-5 py-6 sm:px-7 sm:py-7" aria-labelledby={`${id}-heading`} id={id}>
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight" id={`${id}-heading`}>
              {title}
            </h2>
            {complete ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Check aria-hidden="true" className="size-3.5" /> Complete
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function StepVisibility({ children, current, when }: { children: ReactNode; current: number; when: number }) {
  return current === when ? children : null
}

function intakeSteps(requirement: ReturnType<typeof buildRequirement>) {
  return [
    { label: 'Requirement', complete: Boolean(requirement.objective) },
    { label: 'Validation profile', complete: Boolean(requirement.testDimensions.length) },
    { label: 'Scope', complete: Boolean(requirement.includedScope.length) },
    { label: 'Environments', complete: Boolean(requirement.environmentIds.length) },
    { label: 'Evidence and context', complete: Boolean(requirement.desiredEvidenceSignals.length) },
  ]
}

function IntakeGuide({
  currentStep,
  onSelect,
  requirement,
}: {
  currentStep: number
  onSelect: (step: number) => void
  requirement: ReturnType<typeof buildRequirement>
}) {
  const items = intakeSteps(requirement)
  const completed = items.filter(item => item.complete).length
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="border-border/80 bg-card/40 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Journey brief</p>
          <span className="font-mono text-xs text-muted-foreground">{completed}/5</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Complete the five inputs required for review.</p>
        <nav
          className="mt-4 flex gap-1 overflow-x-auto pb-1 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 xl:block xl:space-y-1"
          aria-label="Requirement intake sections"
        >
          {items.map((item, index) => {
            return (
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
                {item.complete ? <Check aria-hidden="true" className="size-3.5 text-primary" /> : null}
              </button>
            )
          })}
        </nav>
      </div>
      <div className="border-primary/20 bg-primary/[0.06] mt-3 flex gap-2 rounded-xl border px-4 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>Supplied answers become binding intent. The Analyzer asks only about gaps, conflicts, or feasibility.</p>
      </div>
    </aside>
  )
}

function SummaryList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{values.length ? values.join(', ') : 'Not supplied'}</dd>
    </div>
  )
}

function IntakeReview({
  requirement,
  environments,
  error,
  isPending,
  onConfirm,
  onEdit,
}: {
  requirement: ReturnType<typeof buildRequirement>
  environments: EnvironmentOption[]
  error: string | null
  isPending: boolean
  onConfirm: () => void
  onEdit: () => void
}) {
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" /> Review binding intake
        </CardTitle>
        <CardDescription>
          Confirmation creates the immutable Journey. Supplied fields become user-authorized intent for analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <SummaryList label="Requirement" values={[requirement.objective]} />
          <SummaryList label="Context" values={requirement.context ? [requirement.context] : []} />
          <SummaryList label="Coverage rigor" values={[requirement.coverageRigor.toLocaleLowerCase()]} />
          <SummaryList
            label="Test dimensions"
            values={requirement.testDimensions.map(
              value => dimensions.find(item => item.value === value)?.label ?? value,
            )}
          />
          <SummaryList
            label="Environments"
            values={requirement.environmentIds.map(id => environments.find(item => item.id === id)?.name ?? id)}
          />
          <SummaryList label="Included scope" values={requirement.includedScope} />
          <SummaryList label="Desired evidence" values={requirement.desiredEvidenceSignals} />
          <SummaryList label="Excluded scope" values={requirement.excludedScope ?? []} />
          <SummaryList label="Actors" values={requirement.actors ?? []} />
          <SummaryList label="Test data needs" values={requirement.testDataNeeds ?? []} />
          <SummaryList
            label="Risks and constraints"
            values={[...(requirement.risks ?? []), ...(requirement.constraints ?? [])]}
          />
        </dl>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={onConfirm} type="button">
            <ShieldCheck aria-hidden="true" className="mr-2 size-4" />
            {isPending ? 'Creating Journey…' : 'Confirm and create Journey'}
          </Button>
          <Button disabled={isPending} onClick={onEdit} type="button" variant="outline">
            <ChevronLeft aria-hidden="true" className="mr-2 size-4" /> Edit intake
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function WizardFooter({
  currentStep,
  error,
  isPending,
  missingCount,
  onBack,
  onContinue,
  onReview,
  stepComplete,
  stepCount,
}: {
  currentStep: number
  error: string | null
  isPending: boolean
  missingCount: number
  onBack: () => void
  onContinue: () => void
  onReview: () => void
  stepComplete: boolean
  stepCount: number
}) {
  const isLastStep = currentStep === stepCount - 1
  return (
    <div className="bg-muted/15 flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          Step {currentStep + 1} of {stepCount}
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
          <Button
            className="shrink-0 active:translate-y-px"
            disabled={isPending || Boolean(missingCount)}
            onClick={onReview}
            type="button"
          >
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

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
  initialEnvironments,
}: {
  projectId: string
  predecessorJourneyId?: string
  initialEnvironments: EnvironmentOption[]
}) {
  const { push } = useRouter()
  const [state, dispatch] = useReducer(intakeReducer, initialEnvironments, initialIntakeState)
  const {
    currentStep,
    reviewing,
    objective,
    context,
    coverageRigor,
    testDimensions,
    includedScope,
    excludedScope,
    desiredEvidenceSignals,
    actors,
    testDataNeeds,
    constraints,
    risks,
    environments,
    environmentIds,
    environmentName,
    environmentUrl,
    showEnvironmentForm,
    error,
  } = state
  const idempotencyKey = useRef(actionId('quality-journey'))
  const [isPending, startTransition] = useTransition()

  const update = (patch: Partial<IntakeState>) => dispatch({ type: 'patch', patch })

  const requirement = buildRequirement({
    objective,
    context,
    coverageRigor,
    testDimensions,
    includedScope,
    excludedScope,
    environmentIds,
    actors,
    testDataNeeds,
    constraints,
    risks,
    desiredEvidenceSignals,
  })
  const missing = missingRequiredIntake(requirement)
  const steps = intakeSteps(requirement)
  const currentStepComplete = steps[currentStep]?.complete ?? false

  function toggleDimension(value: Dimension, checked: boolean) {
    if (!checked && testDimensions.length === 1 && testDimensions[0] === value) return
    update({
      testDimensions: checked
        ? [...new Set([...testDimensions, value])]
        : testDimensions.filter(dimension => dimension !== value),
    })
  }

  function toggleEnvironment(value: string, checked: boolean) {
    update({
      environmentIds: checked ? [...new Set([...environmentIds, value])] : environmentIds.filter(id => id !== value),
    })
  }

  function registerEnvironment() {
    startTransition(async () => {
      const response = await ensureQualityJourneyIntakeEnvironmentAction({
        allowCreate: true,
        proposal: {
          name: environmentName,
          baseUrl: environmentUrl,
          expectedPageTitle: '',
          apiBaseUrl: '',
          username: '',
          passwordEnvironmentVariable: '',
        },
      })
      const environment = environmentFrom(response)
      if (!environment) {
        update({ error: response.error ?? 'Unable to register this environment.' })
        return
      }
      dispatch({ type: 'environment-registered', environment })
      toast({ title: 'Environment registered', description: `${environment.name} is included in this intake.` })
    })
  }

  function submit() {
    update({ error: null })
    startTransition(async () => {
      const response = await createQualityJourneyAction({
        requirement,
        idempotencyKey: idempotencyKey.current,
        ...(predecessorJourneyId ? { predecessorJourneyId } : {}),
      })
      const journeyId = journeyIdFrom(response)
      if (!journeyId) {
        const message = response.error ?? 'Unable to create this Quality Journey.'
        update({ error: message })
        toast({ title: 'Journey creation failed', description: message, variant: 'destructive' })
        return
      }
      toast({ title: 'Requirement submitted', description: 'Review the Journey, then start analysis with Codex.' })
      push(`/quality-journeys/${journeyId}?project=${encodeURIComponent(projectId)}`)
      idempotencyKey.current = actionId('quality-journey')
    })
  }

  if (reviewing) {
    return (
      <IntakeReview
        environments={environments}
        error={error}
        isPending={isPending}
        onConfirm={submit}
        onEdit={() => update({ reviewing: false })}
        requirement={requirement}
      />
    )
  }

  return (
    <div className="space-y-5">
      <header className="border-primary/20 bg-card/50 relative overflow-hidden rounded-xl border px-5 py-6 sm:px-7">
        <div className="from-primary/[0.08] pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l to-transparent" />
        <div className="relative">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Prepare a Quality Journey</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Shape the brief your coordinator will receive. Nothing is created until you review and confirm it.
              {predecessorJourneyId ? ` This Journey follows ${predecessorJourneyId}.` : null}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <IntakeGuide
          currentStep={currentStep}
          onSelect={step => update({ currentStep: step })}
          requirement={requirement}
        />
        <div className="border-border/80 bg-card/30 overflow-hidden rounded-xl border">
          <StepVisibility current={currentStep} when={0}>
            <IntakeSection
              complete={Boolean(requirement.objective)}
              description="State the outcome or behavior that should be trusted when this Journey is complete."
              id="intake-requirement"
              title="Requirement"
            >
              <div className="space-y-2">
                <Label htmlFor="quality-journey-objective">Outcome or behavior to validate</Label>
                <Textarea
                  id="quality-journey-objective"
                  onChange={event => update({ objective: event.target.value })}
                  placeholder="Describe the user need, outcome, and important behavior."
                  value={objective}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quality-journey-context">
                  Context <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="quality-journey-context"
                  onChange={event => update({ context: event.target.value })}
                  placeholder="Business background, change history, or stakeholder context"
                  value={context}
                />
              </div>
            </IntakeSection>
          </StepVisibility>

          <StepVisibility current={currentStep} when={1}>
            <IntakeSection
              complete={Boolean(requirement.testDimensions.length)}
              description="Choose how deeply to investigate and which quality perspectives matter."
              id="intake-profile"
              title="Validation profile"
            >
              <div className="space-y-2">
                <Label htmlFor="quality-journey-rigor">Coverage rigor</Label>
                <Select
                  onValueChange={value => update({ coverageRigor: value as keyof typeof rigorDescriptions })}
                  value={coverageRigor}
                >
                  <SelectTrigger id="quality-journey-rigor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(rigorDescriptions).map(value => (
                      <SelectItem key={value} value={value}>
                        {value.toLocaleLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{rigorDescriptions[coverageRigor]}</p>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Test dimensions</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {dimensions.map(item => (
                    <div
                      className="border-border/80 bg-background/30 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.07] flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors"
                      key={item.value}
                    >
                      <Checkbox
                        checked={testDimensions.includes(item.value)}
                        id={`quality-journey-dimension-${item.value}`}
                        onCheckedChange={checked => toggleDimension(item.value, checked === true)}
                      />
                      <Label htmlFor={`quality-journey-dimension-${item.value}`}>{item.label}</Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            </IntakeSection>
          </StepVisibility>

          <StepVisibility current={currentStep} when={2}>
            <IntakeSection
              complete={Boolean(requirement.includedScope.length)}
              description="Draw the boundary clearly so analysis can protect what matters without inventing scope."
              id="intake-scope"
              title="Scope"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quality-journey-included">Included behavior</Label>
                  <Textarea
                    id="quality-journey-included"
                    onChange={event => update({ includedScope: event.target.value })}
                    placeholder="One scope item per line"
                    value={includedScope}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quality-journey-excluded">
                    Excluded behavior <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="quality-journey-excluded"
                    onChange={event => update({ excludedScope: event.target.value })}
                    placeholder="One exclusion per line"
                    value={excludedScope}
                  />
                </div>
              </div>
            </IntakeSection>
          </StepVisibility>

          <StepVisibility current={currentStep} when={3}>
            <IntakeSection
              complete={Boolean(requirement.environmentIds.length)}
              description="Bind the brief to registered targets so the coordinator works from stable environment identities."
              id="intake-environment"
              title="Target environments"
            >
              {environments.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {environments.map(environment => (
                    <div
                      className="border-border/80 bg-background/30 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.07] flex min-w-0 items-start gap-2 rounded-lg border p-3 text-sm transition-colors"
                      key={environment.id}
                    >
                      <Checkbox
                        checked={environmentIds.includes(environment.id)}
                        id={`quality-journey-environment-${environment.id}`}
                        onCheckedChange={checked => toggleEnvironment(environment.id, checked === true)}
                      />
                      <Label className="min-w-0" htmlFor={`quality-journey-environment-${environment.id}`}>
                        <span className="block font-medium">{environment.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{environment.baseUrl}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <p className="text-sm font-medium">No environments registered</p>
                  <p className="mt-1 text-xs text-muted-foreground">Register a target here to bind it to this brief.</p>
                </div>
              )}
              {showEnvironmentForm ? (
                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="intake-environment-name">Environment name</Label>
                    <Input
                      id="intake-environment-name"
                      onChange={event => update({ environmentName: event.target.value })}
                      placeholder="Staging"
                      value={environmentName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-environment-url">Base URL</Label>
                    <Input
                      id="intake-environment-url"
                      onChange={event => update({ environmentUrl: event.target.value })}
                      placeholder="https://staging.example.com"
                      type="url"
                      value={environmentUrl}
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button
                      disabled={isPending || !environmentName.trim() || !environmentUrl.trim()}
                      onClick={registerEnvironment}
                      size="sm"
                      type="button"
                    >
                      <Plus aria-hidden="true" className="mr-2 size-4" /> Register and select
                    </Button>
                    <Button
                      onClick={() => update({ showEnvironmentForm: false })}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => update({ showEnvironmentForm: true })} size="sm" type="button" variant="outline">
                  <Plus aria-hidden="true" className="mr-2 size-4" /> Register environment
                </Button>
              )}
            </IntakeSection>
          </StepVisibility>

          <StepVisibility current={currentStep} when={4}>
            <>
              <IntakeSection
                complete={Boolean(requirement.desiredEvidenceSignals.length)}
                description="Name the observable signals that would make the result credible to you."
                id="intake-evidence"
                title="Evidence and context"
              >
                <Label htmlFor="quality-journey-evidence">Observable outcomes that would satisfy you</Label>
                <Textarea
                  id="quality-journey-evidence"
                  onChange={event => update({ desiredEvidenceSignals: event.target.value })}
                  placeholder="One observable signal per line"
                  value={desiredEvidenceSignals}
                />
              </IntakeSection>

              <details className="border-border/70 group border-t px-5 py-6 sm:px-7">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold">
                  Additional intent and constraints
                  <span className="ml-auto text-xs font-normal text-muted-foreground">Optional</span>
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    [
                      'actors',
                      'Actors',
                      actors,
                      (value: string) => update({ actors: value }),
                      'Roles or user types, one per line',
                    ],
                    [
                      'data',
                      'Test data needs',
                      testDataNeeds,
                      (value: string) => update({ testDataNeeds: value }),
                      'Required accounts, records, or states',
                    ],
                    [
                      'constraints',
                      'Constraints',
                      constraints,
                      (value: string) => update({ constraints: value }),
                      'Time, browser, device, or operational limits',
                    ],
                    [
                      'risks',
                      'Known risks',
                      risks,
                      (value: string) => update({ risks: value }),
                      'Failure impact or areas requiring extra scrutiny',
                    ],
                  ].map(([key, label, value, setter, placeholder]) => (
                    <div className="space-y-2" key={key as string}>
                      <Label htmlFor={`quality-journey-${key}`}>
                        {label as string} <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Textarea
                        id={`quality-journey-${key}`}
                        onChange={event => (setter as (next: string) => void)(event.target.value)}
                        placeholder={placeholder as string}
                        value={value as string}
                      />
                    </div>
                  ))}
                </div>
              </details>
            </>
          </StepVisibility>

          <WizardFooter
            currentStep={currentStep}
            error={error}
            isPending={isPending}
            missingCount={missing.length}
            onBack={() => update({ currentStep: currentStep - 1 })}
            onContinue={() => update({ currentStep: currentStep + 1 })}
            onReview={() => update({ reviewing: true })}
            stepComplete={currentStepComplete}
            stepCount={steps.length}
          />
        </div>
      </div>
    </div>
  )
}
