'use client'

import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'

import {
  lines,
  rigorDescriptions,
  type CoverageRigor,
  type EnvironmentOption,
  type IntakeState,
  type UpdateIntake,
} from './quality-journey-create-form-shared'

type ScreenProps = Pick<
  IntakeState,
  | 'objective'
  | 'context'
  | 'coverageRigor'
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

const glassFieldClassName =
  'border-white/[0.09] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-10px_24px_rgba(0,0,0,0.12)] backdrop-blur-md hover:border-white/[0.13] focus-visible:border-primary/45 focus-visible:bg-white/[0.05] focus-visible:ring-primary/30'
const liquidGlassButtonClassName =
  'rounded-full border border-white/[0.16] bg-[linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.035))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.045),0_10px_24px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-[transform,background-color,border-color,box-shadow] hover:border-white/[0.24] hover:bg-white/[0.105] hover:text-foreground active:translate-y-px active:scale-[0.985]'
const liquidGlassPrimaryButtonClassName =
  'rounded-full border border-white/[0.22] bg-[linear-gradient(180deg,hsl(var(--primary)/0.88),hsl(var(--primary)/0.66))] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.16),0_12px_28px_-16px_hsl(var(--primary)/0.7)] backdrop-blur-xl transition-[transform,filter,box-shadow] hover:brightness-110 active:translate-y-px active:scale-[0.985]'
const liquidGlassIconButtonClassName =
  'rounded-full border border-transparent bg-white/[0.025] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-[transform,background-color,border-color,color] hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-foreground active:scale-95'

export function GoalIntakeScreen({ context, objective, update }: ScreenProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="quality-journey-objective">Outcome or behavior to validate</Label>
        <Textarea
          className={glassFieldClassName}
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
          className={glassFieldClassName}
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
      <div className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.018))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-16px_32px_rgba(0,0,0,0.1)] backdrop-blur-lg">
        <EditableCardList
          addLabel="Add included behavior"
          description="The user flow and behaviors AppraiseJS should cover."
          id="quality-journey-included"
          label="Included behavior"
          onChange={value => update({ includedScope: value })}
          placeholder="For example: A customer can complete checkout"
          value={includedScope}
        />
        <EditableCardList
          addLabel="Add excluded behavior"
          description="Related behavior that should stay outside this journey."
          id="quality-journey-excluded"
          label="Excluded behavior"
          onChange={value => update({ excludedScope: value })}
          optional
          placeholder="For example: Subscription renewals"
          value={excludedScope}
        />
        <EditableCardList
          addLabel="Add success signal"
          description="A visible result that proves the flow worked."
          id="quality-journey-evidence"
          label="How will you know it worked?"
          onChange={value => update({ desiredEvidenceSignals: value })}
          placeholder="For example: An order confirmation is shown"
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
                className={glassFieldClassName}
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

function EditableCardList({
  addLabel,
  description,
  id,
  label,
  onChange,
  optional = false,
  placeholder,
  value,
}: {
  addLabel: string
  description: string
  id: string
  label: string
  onChange: (value: string) => void
  optional?: boolean
  placeholder: string
  value: string
}) {
  const items = lines(value)
  const [draft, setDraft] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const commit = () => {
    const next = draft.trim()
    if (!next) return
    const updated =
      editingIndex === null ? [...items, next] : items.map((item, index) => (index === editingIndex ? next : item))
    onChange([...new Set(updated)].join('\n'))
    setDraft('')
    setEditingIndex(null)
  }
  const cancel = () => {
    setDraft('')
    setEditingIndex(null)
  }

  return (
    <fieldset className="focus-within:bg-primary/[0.025] p-4 transition-colors sm:p-5">
      <legend className="sr-only">{label}</legend>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <Label className="text-sm font-semibold" htmlFor={id}>
            {label}
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={label}
          className={`${glassFieldClassName} h-10`}
          id={id}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
        <Button
          aria-label={editingIndex === null ? addLabel : `Save ${label.toLocaleLowerCase()}`}
          disabled={!draft.trim()}
          onClick={commit}
          size="sm"
          type="button"
          variant="outline"
          className={`${liquidGlassButtonClassName} h-10 px-4 text-primary hover:text-primary`}
        >
          {editingIndex === null ? (
            <Plus aria-hidden="true" className="size-4" />
          ) : (
            <Check aria-hidden="true" className="size-4" />
          )}
          {editingIndex === null ? 'Add' : 'Save'}
        </Button>
        {editingIndex !== null ? (
          <Button
            aria-label={`Cancel editing ${label.toLocaleLowerCase()}`}
            className={`${liquidGlassIconButtonClassName} size-10`}
            onClick={cancel}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li
              className="group/item flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
              key={item}
            >
              <span className="text-foreground/90 min-w-0 flex-1 text-sm leading-5">{item}</span>
              <Button
                aria-label={`Edit ${label.toLocaleLowerCase()}: ${item}`}
                className={`${liquidGlassIconButtonClassName} size-8`}
                onClick={() => {
                  setDraft(item)
                  setEditingIndex(index)
                  requestAnimationFrame(() => document.getElementById(id)?.focus())
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                aria-label={`Remove ${label.toLocaleLowerCase()}: ${item}`}
                className={`${liquidGlassIconButtonClassName} hover:border-destructive/25 hover:bg-destructive/10 size-8 hover:text-destructive`}
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index).join('\n'))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No items added yet.</p>
      )}
    </fieldset>
  )
}

export function ChecksIntakeScreen({ coverageRigor, update }: ScreenProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">How much end-to-end coverage do you need?</legend>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        AppraiseJS currently validates complete user flows. Choose how far it should explore beyond the main path.
      </p>
      <RadioGroup
        className="mt-4 grid gap-3 lg:grid-cols-3"
        onValueChange={value => update({ coverageRigor: value as CoverageRigor })}
        value={coverageRigor}
      >
        {Object.entries(rigorDescriptions).map(([value, description]) => (
          <Label
            className="has-[[data-state=checked]]:border-primary/45 has-[[data-state=checked]]:bg-primary/[0.08] flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
            htmlFor={`quality-journey-rigor-${value}`}
            key={value}
          >
            <RadioGroupItem id={`quality-journey-rigor-${value}`} value={value} />
            <span>
              <span className="block text-sm font-medium capitalize">{value.toLocaleLowerCase()}</span>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
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
        <Button
          className={liquidGlassButtonClassName}
          onClick={() => update({ showEnvironmentForm: true })}
          size="sm"
          type="button"
          variant="outline"
        >
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
          className="has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/[0.07] flex min-w-0 items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-colors"
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
    <div className="grid gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="intake-environment-name">Environment name</Label>
        <Input
          className={glassFieldClassName}
          id="intake-environment-name"
          onChange={event => update({ environmentName: event.target.value })}
          placeholder="Staging"
          value={environmentName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="intake-environment-url">Base URL</Label>
        <Input
          className={glassFieldClassName}
          id="intake-environment-url"
          onChange={event => update({ environmentUrl: event.target.value })}
          placeholder="https://staging.example.com"
          type="url"
          value={environmentUrl}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button
          className={liquidGlassPrimaryButtonClassName}
          disabled={isPending || !environmentName.trim() || !environmentUrl.trim()}
          onClick={onRegister}
          size="sm"
          type="button"
        >
          <Plus aria-hidden="true" className="mr-2 size-4" /> Register and select
        </Button>
        <Button className={liquidGlassButtonClassName} onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  )
}
