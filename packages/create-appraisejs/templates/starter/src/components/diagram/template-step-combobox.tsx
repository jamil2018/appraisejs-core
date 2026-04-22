'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { cn } from '@/lib/utils'
import {
  capitalizeGroupName,
  type TemplateStepWithGroup,
} from '@/types/diagram/template-step'

const GROUP_KEY_OTHER = 'Other'
const MAX_VISIBLE_PARAMETER_BADGES = 4

function groupStepsByGroupName(
  steps: TemplateStepWithGroup[],
): Map<string, TemplateStepWithGroup[]> {
  const map = new Map<string, TemplateStepWithGroup[]>()
  for (const step of steps) {
    const key = step.templateStepGroup?.name ?? GROUP_KEY_OTHER
    const list = map.get(key) ?? []
    list.push(step)
    map.set(key, list)
  }
  return map
}

function buildStepKeywords(step: TemplateStepWithGroup, groupKey: string) {
  return [step.description, groupKey, ...(step.parameters ?? []).map(parameter => parameter.name)].filter(Boolean)
}

function formatParameterLabel(label: string) {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function StepIcon({
  icon,
  className,
}: {
  icon: TemplateStepWithGroup['icon']
  className?: string
}) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
      {KeyToIconTransformer(icon, className ?? 'h-4 w-4')}
    </span>
  )
}

export type TemplateStepComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  templateSteps: TemplateStepWithGroup[]
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
}

const TemplateStepCombobox = ({
  value,
  onValueChange,
  templateSteps,
  placeholder = 'Select a template step',
  disabled = false,
  id,
  className,
}: TemplateStepComboboxProps) => {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const generatedId = React.useId()
  const comboboxId = id ?? generatedId
  const listboxId = `${comboboxId}-listbox`

  const selectedStep = React.useMemo(
    () => templateSteps.find(s => s.id === value) ?? null,
    [templateSteps, value],
  )

  const groups = React.useMemo(() => {
    const map = groupStepsByGroupName(templateSteps)
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [templateSteps])

  const handleSelect = React.useCallback(
    (stepId: string) => {
      onValueChange(stepId)
      setOpen(false)
    },
    [onValueChange],
  )

  React.useEffect(() => {
    if (!open) return
    // Focus search input when dropdown opens so user can type immediately
    const focusSearch = () => searchInputRef.current?.focus()
    const id = requestAnimationFrame(focusSearch)
    return () => cancelAnimationFrame(id)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        id={comboboxId}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        aria-label={id ? undefined : placeholder}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'text-left',
          className,
        )}
      >
        {selectedStep ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <StepIcon icon={selectedStep.icon} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold capitalize text-foreground">{selectedStep.name}</span>
              {selectedStep.description ? (
                <span className="block truncate text-xs text-muted-foreground">{selectedStep.description}</span>
              ) : null}
            </span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div id={listboxId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1">
          <Command shouldFilter className="rounded-md border border-input bg-popover shadow-md">
            <CommandInput ref={searchInputRef} placeholder="Search template steps…" />
            <CommandList>
              <CommandEmpty>No step found.</CommandEmpty>
              {groups.map(([groupKey, steps]) => (
                <CommandGroup
                  key={groupKey}
                  heading={
                    <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                      <span>{capitalizeGroupName(groupKey)}</span>
                      <span className="text-[10px] font-normal tracking-normal">{steps.length}</span>
                    </div>
                  }
                >
                  {steps.map(step => (
                    <CommandItem
                      key={step.id}
                      value={step.name}
                      keywords={buildStepKeywords(step, groupKey)}
                      onSelect={() => handleSelect(step.id)}
                      className={cn(
                        'items-start gap-3 rounded-lg border border-transparent px-3 py-3 text-left hover:cursor-pointer',
                        'data-[selected=true]:border-emerald-500/35 data-[selected=true]:bg-emerald-500/20 dark:data-[selected=true]:bg-emerald-500/5 data-[selected=true]:text-foreground',
                      )}
                    >
                      <StepIcon icon={step.icon} className="h-4 w-4" />
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block space-y-1">
                          <span className="block truncate font-bold capitalize leading-tight">{step.name}</span>
                          {step.description ? (
                            <span className="line-clamp-2 block text-xs leading-5 text-muted-foreground">
                              {step.description}
                            </span>
                          ) : null}
                        </span>
                        {step.parameters?.length ? (
                          <span className="flex flex-wrap gap-1.5">
                            {step.parameters.slice(0, MAX_VISIBLE_PARAMETER_BADGES).map(parameter => (
                              <Badge
                                key={parameter.id}
                                variant="secondary"
                                className="max-w-full truncate text-[10px] font-medium"
                              >
                                {formatParameterLabel(parameter.name)}
                              </Badge>
                            ))}
                            {step.parameters.length > MAX_VISIBLE_PARAMETER_BADGES ? (
                              <Badge variant="outline" className="text-[10px] font-medium">
                                +{step.parameters.length - MAX_VISIBLE_PARAMETER_BADGES}
                              </Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}

export default TemplateStepCombobox
