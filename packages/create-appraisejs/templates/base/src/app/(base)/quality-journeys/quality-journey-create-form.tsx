'use client'

import { ChevronLeft, Plus, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useReducer, useRef, useTransition } from 'react'

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

function SummaryList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{values.length ? values.join(' · ') : 'Not supplied'}</dd>
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

  function toggleDimension(value: Dimension, checked: boolean) {
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
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Prepare a Quality Journey</CardTitle>
        <CardDescription>
          Describe the requirement and evidence you need. Appraise creates nothing until you review and confirm.
          {predecessorJourneyId ? ` Linked follow-up to ${predecessorJourneyId}.` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4" aria-labelledby="intake-requirement-heading">
          <h2 className="text-sm font-semibold" id="intake-requirement-heading">
            1. Requirement
          </h2>
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
        </section>

        <section className="space-y-4" aria-labelledby="intake-profile-heading">
          <h2 className="text-sm font-semibold" id="intake-profile-heading">
            2. Validation profile
          </h2>
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
                <div className="flex items-center gap-2 rounded-md border p-2 text-sm" key={item.value}>
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
        </section>

        <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="intake-scope-heading">
          <h2 className="text-sm font-semibold sm:col-span-2" id="intake-scope-heading">
            3. Scope
          </h2>
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
        </section>

        <section className="space-y-3" aria-labelledby="intake-environment-heading">
          <h2 className="text-sm font-semibold" id="intake-environment-heading">
            4. Target environments
          </h2>
          {environments.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {environments.map(environment => (
                <div className="flex min-w-0 items-start gap-2 rounded-md border p-3 text-sm" key={environment.id}>
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
            <p className="text-sm text-muted-foreground">No environments are registered for this project.</p>
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
                  Register and select
                </Button>
                <Button onClick={() => update({ showEnvironmentForm: false })} size="sm" type="button" variant="ghost">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => update({ showEnvironmentForm: true })} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" className="mr-2 size-4" /> Register environment
            </Button>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="intake-evidence-heading">
          <h2 className="text-sm font-semibold" id="intake-evidence-heading">
            5. Desired evidence
          </h2>
          <Label htmlFor="quality-journey-evidence">Observable outcomes that would satisfy you</Label>
          <Textarea
            id="quality-journey-evidence"
            onChange={event => update({ desiredEvidenceSignals: event.target.value })}
            placeholder="One observable signal per line"
            value={desiredEvidenceSignals}
          />
        </section>

        <details className="rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-semibold">6. Additional intent and constraints</summary>
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

        {missing.length ? (
          <p className="text-sm text-muted-foreground" role="status">
            Before review, provide {missing.join(', ')}.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          disabled={isPending || Boolean(missing.length)}
          onClick={() => update({ reviewing: true })}
          type="button"
        >
          Review Journey intake
        </Button>
      </CardContent>
    </Card>
  )
}
