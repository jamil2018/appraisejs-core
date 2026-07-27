'use client'

import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StepDefinitionOption } from '@/types/step-definition-option'

type StepDefinitionPickerProps = {
  definitions: StepDefinitionOption[]
  value?: StepDefinitionOption
  onChange: (definition: StepDefinitionOption | undefined) => void
  id?: string
}

function keyOf(definition: StepDefinitionOption): string {
  return `${definition.reference.id}@${definition.reference.version}@${definition.reference.definitionHash}`
}

export function StepDefinitionPicker({
  definitions,
  value,
  onChange,
  id = 'step-definition',
}: StepDefinitionPickerProps) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized
      ? definitions.filter(definition =>
          `${definition.title} ${definition.signature}`.toLowerCase().includes(normalized),
        )
      : definitions
  }, [definitions, query])

  return (
    <div className="min-w-64 flex-1 space-y-2">
      <Label htmlFor={`${id}-search`}>Step Definition</Label>
      <Input
        id={`${id}-search`}
        type="search"
        value={query}
        placeholder="Search ready Step Definitions"
        onChange={event => setQuery(event.target.value)}
      />
      <select
        id={id}
        aria-label="Step Definition results"
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={value ? keyOf(value) : ''}
        onChange={event => onChange(filtered.find(definition => keyOf(definition) === event.target.value))}
      >
        <option value="">Select a ready Step Definition</option>
        {filtered.map(definition => (
          <option key={keyOf(definition)} value={keyOf(definition)}>
            {definition.title} ({definition.reference.id}@{definition.reference.version})
          </option>
        ))}
      </select>
      {definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ready Step Definitions are available.</p>
      ) : null}
    </div>
  )
}
