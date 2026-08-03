'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
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
  const [open, setOpen] = useState(false)
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
    <div className="flex min-w-64 flex-1 flex-col gap-2">
      <Label htmlFor={id}>Step Definition</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-label="Step Definition results"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            className="h-auto min-h-10 w-full justify-between px-3 py-2 text-left font-normal"
          >
            <span className="min-w-0 truncate">{value ? value.title : 'Select a ready Step Definition'}</span>
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} placeholder="Search ready Step Definitions" onValueChange={setQuery} />
            <CommandList id={`${id}-list`}>
              <CommandEmpty>No ready Step Definitions match.</CommandEmpty>
              <CommandGroup heading="Ready Step Definitions">
                {filtered.map(definition => {
                  const selected = value ? keyOf(value) === keyOf(definition) : false
                  return (
                    <CommandItem
                      key={keyOf(definition)}
                      value={keyOf(definition)}
                      className="items-start py-3"
                      onSelect={() => {
                        onChange(definition)
                        setOpen(false)
                        setQuery('')
                      }}
                    >
                      <Check className={cn('mt-0.5', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="font-medium">{definition.title}</span>
                        <span className="break-words text-xs text-muted-foreground">{definition.signature}</span>
                        <span className="text-xs text-muted-foreground">
                          {definition.reference.id} · v{definition.reference.version} · {definition.inputs.length}{' '}
                          {definition.inputs.length === 1 ? 'input' : 'inputs'}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ready Step Definitions are available.</p>
      ) : null}
    </div>
  )
}
