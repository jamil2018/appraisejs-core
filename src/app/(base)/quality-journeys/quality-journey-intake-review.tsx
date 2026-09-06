'use client'

import { ChevronLeft, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { dimensions, type EnvironmentOption, type Requirement } from './quality-journey-create-form-shared'

type ReviewField = { label: string; values?: string[] }

function ReviewValues({ values }: { values: string[] }) {
  return values.length > 1 ? (
    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
      {values.map(value => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  ) : (
    <dd className="mt-1 text-sm">{values[0]}</dd>
  )
}

function ReviewFieldList({ fields }: { fields: ReviewField[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {fields.flatMap(field => {
        const values = field.values ?? []
        return values.length
          ? [
              <div key={field.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
                <ReviewValues values={values} />
              </div>,
            ]
          : []
      })}
    </dl>
  )
}

function SectionEdit({ onEdit, step }: { onEdit: (step: number) => void; step: number }) {
  return (
    <Button onClick={() => onEdit(step)} size="sm" type="button" variant="outline">
      Edit
    </Button>
  )
}

export function IntakeReview({
  requirement,
  environments,
  error,
  isPending,
  onConfirm,
  onDiscard,
  onEdit,
  onEditIntake,
}: {
  requirement: Requirement
  environments: EnvironmentOption[]
  error: string | null
  isPending: boolean
  onConfirm: () => void
  onDiscard: () => void
  onEdit: (step: number) => void
  onEditIntake: () => void
}) {
  const environmentNames = requirement.environmentIds.map(id => environments.find(item => item.id === id)?.name ?? id)
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Review binding intake</CardTitle>
        <CardDescription>
          Confirmation creates the immutable Journey. Supplied fields become user-authorized intent for analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ReviewSection onEdit={onEdit} step={0} title="Goal">
          <ReviewFieldList
            fields={[
              { label: 'Requirement', values: [requirement.objective] },
              { label: 'Context', values: requirement.context ? [requirement.context] : [] },
            ]}
          />
        </ReviewSection>
        <ReviewSection onEdit={onEdit} step={1} title="Scope and success">
          <ReviewFieldList
            fields={[
              { label: 'Included scope', values: requirement.includedScope },
              { label: 'Desired evidence', values: requirement.desiredEvidenceSignals },
              { label: 'Excluded scope', values: requirement.excludedScope },
              { label: 'Actors', values: requirement.actors },
              { label: 'Test data needs', values: requirement.testDataNeeds },
              { label: 'Risks', values: requirement.risks },
              { label: 'Constraints', values: requirement.constraints },
            ]}
          />
        </ReviewSection>
        <ReviewSection onEdit={onEdit} step={2} title="Checks">
          <ReviewFieldList
            fields={[
              { label: 'Coverage rigor', values: [requirement.coverageRigor.toLocaleLowerCase()] },
              {
                label: 'Test dimensions',
                values: requirement.testDimensions.map(
                  value => dimensions.find(item => item.value === value)?.label ?? value,
                ),
              },
            ]}
          />
        </ReviewSection>
        <ReviewSection onEdit={onEdit} step={3} title="Test location">
          <ReviewFieldList fields={[{ label: 'Environments', values: environmentNames }]} />
        </ReviewSection>
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
          <Button disabled={isPending} onClick={onEditIntake} type="button" variant="outline">
            <ChevronLeft aria-hidden="true" className="mr-2 size-4" /> Edit intake
          </Button>
          <Button disabled={isPending} onClick={onDiscard} type="button" variant="ghost">
            Discard draft
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReviewSection({
  children,
  onEdit,
  step,
  title,
}: {
  children: React.ReactNode
  onEdit: (step: number) => void
  step: number
  title: string
}) {
  return (
    <section className="border-border/70 space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <SectionEdit onEdit={onEdit} step={step} />
      </div>
      {children}
    </section>
  )
}
