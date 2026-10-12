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
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] overflow-hidden border-white/[0.12] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.014)),rgba(13,20,34,0.9)] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_24px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
        >
          <Command className="bg-transparent" shouldFilter={false}>
            <CommandInput value={query} placeholder="Search ready Step Definitions" onValueChange={setQuery} />
            <CommandList
              className="overscroll-contain [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-white/[0.08] [&::-webkit-scrollbar-thumb]:bg-white/[0.16] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
              id={`${id}-list`}
              onWheel={event => {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.scrollTop += event.deltaY
              }}
            >
              <CommandEmpty>No ready Step Definitions match.</CommandEmpty>
              <CommandGroup heading="Ready Step Definitions">
                {filtered.map(definition => {
                  const selected = value ? keyOf(value) === keyOf(definition) : false
                  return (
                    <CommandItem
                      key={keyOf(definition)}
                      value={keyOf(definition)}
                      className="mx-1 items-start rounded-lg border border-transparent py-3 data-[selected=true]:border-white/[0.08]"
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
