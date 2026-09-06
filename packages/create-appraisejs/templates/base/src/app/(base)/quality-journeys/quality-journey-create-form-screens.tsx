'use client'

import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  dimensions,
  rigorDescriptions,
  type Dimension,
  type EnvironmentOption,
  type IntakeState,
  type UpdateIntake,
} from './quality-journey-create-form-shared'

type ScreenProps = Pick<
  IntakeState,
  | 'objective'
  | 'context'
  | 'coverageRigor'
  | 'testDimensions'
  | 'includedScope'
  | 'excludedScope'
  | 'desiredEvidenceSignals'
  | 'actors'
  | 'testDataNeeds'
  | 'constraints'
  | 'risks'
  | 'environments'
  | 'environmentIds'
  | 'environmentName'
  | 'environmentUrl'
  | 'showEnvironmentForm'
> & { update: UpdateIntake }

export function GoalIntakeScreen({ context, objective, update }: ScreenProps) {
  return (
    <>
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
    </>
  )
}

export function ScopeIntakeScreen({
  actors,
  constraints,
  desiredEvidenceSignals,
  excludedScope,
  includedScope,
  risks,
  testDataNeeds,
  update,
}: ScreenProps) {
  const additionalFields = [
    ['actors', 'Actors', actors, 'Roles or user types, one per line'],
    ['data', 'Test data needs', testDataNeeds, 'Required accounts, records, or states'],
    ['constraints', 'Constraints', constraints, 'Time, browser, device, or operational limits'],
    ['risks', 'Known risks', risks, 'Failure impact or areas requiring extra scrutiny'],
  ] as const
  const updateAdditional = (key: (typeof additionalFields)[number][0], value: string) => {
    const patch =
      key === 'actors'
        ? { actors: value }
        : key === 'data'
          ? { testDataNeeds: value }
          : key === 'constraints'
            ? { constraints: value }
            : { risks: value }
    update(patch)
  }
  return (
    <>
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
      <div className="space-y-2">
        <Label htmlFor="quality-journey-evidence">Observable outcomes that would satisfy you</Label>
        <Textarea
          id="quality-journey-evidence"
          onChange={event => update({ desiredEvidenceSignals: event.target.value })}
          placeholder="One observable signal per line"
          value={desiredEvidenceSignals}
        />
      </div>
      <details className="border-border/70 group border-t pt-5">
        <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold">
          Additional intent and constraints
          <span className="ml-auto text-xs font-normal text-muted-foreground">Optional</span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {additionalFields.map(([key, label, value, placeholder]) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`quality-journey-${key}`}>
                {label} <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id={`quality-journey-${key}`}
                onChange={event => updateAdditional(key, event.target.value)}
                placeholder={placeholder}
                value={value}
              />
            </div>
          ))}
        </div>
      </details>
    </>
  )
}

export function ChecksIntakeScreen({ coverageRigor, testDimensions, update }: ScreenProps) {
  const toggleDimension = (value: Dimension, checked: boolean) => {
    if (!checked && testDimensions.length === 1 && testDimensions[0] === value) return
    update({
      testDimensions: checked
        ? [...new Set([...testDimensions, value])]
        : testDimensions.filter(dimension => dimension !== value),
    })
  }
  return (
    <>
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
    </>
  )
}

export function EnvironmentIntakeScreen({
  environmentIds,
  environmentName,
  environments,
  environmentUrl,
  showEnvironmentForm,
  update,
  onRegister,
  isPending,
}: ScreenProps & { isPending: boolean; onRegister: () => void }) {
  const toggleEnvironment = (value: string, checked: boolean) => {
    update({
      environmentIds: checked ? [...new Set([...environmentIds, value])] : environmentIds.filter(id => id !== value),
    })
  }
  return (
    <>
      {environments.length ? (
        <EnvironmentChoices environments={environments} environmentIds={environmentIds} onToggle={toggleEnvironment} />
      ) : (
        <NoEnvironments />
      )}
      {showEnvironmentForm ? (
        <EnvironmentRegistration
          environmentName={environmentName}
          environmentUrl={environmentUrl}
          isPending={isPending}
          onCancel={() => update({ showEnvironmentForm: false })}
          onRegister={onRegister}
          update={update}
        />
      ) : (
        <Button onClick={() => update({ showEnvironmentForm: true })} size="sm" type="button" variant="outline">
          <Plus aria-hidden="true" className="mr-2 size-4" /> Register environment
        </Button>
      )}
    </>
  )
}

function EnvironmentChoices({
  environments,
  environmentIds,
  onToggle,
}: {
  environments: EnvironmentOption[]
  environmentIds: string[]
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {environments.map(environment => (
        <div
          className="border-border/80 bg-background/30 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.07] flex min-w-0 items-start gap-2 rounded-lg border p-3 text-sm transition-colors"
          key={environment.id}
        >
          <Checkbox
            checked={environmentIds.includes(environment.id)}
            id={`quality-journey-environment-${environment.id}`}
            onCheckedChange={checked => onToggle(environment.id, checked === true)}
          />
          <Label className="min-w-0" htmlFor={`quality-journey-environment-${environment.id}`}>
            <span className="block font-medium">{environment.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{environment.baseUrl}</span>
          </Label>
        </div>
      ))}
    </div>
  )
}

function NoEnvironments() {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-center">
      <p className="text-sm font-medium">No environments registered</p>
      <p className="mt-1 text-xs text-muted-foreground">Register a target here to bind it to this brief.</p>
    </div>
  )
}

function EnvironmentRegistration({
  environmentName,
  environmentUrl,
  isPending,
  onCancel,
  onRegister,
  update,
}: {
  environmentName: string
  environmentUrl: string
  isPending: boolean
  onCancel: () => void
  onRegister: () => void
  update: UpdateIntake
}) {
  return (
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
          onClick={onRegister}
          size="sm"
          type="button"
        >
          <Plus aria-hidden="true" className="mr-2 size-4" /> Register and select
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  )
}
