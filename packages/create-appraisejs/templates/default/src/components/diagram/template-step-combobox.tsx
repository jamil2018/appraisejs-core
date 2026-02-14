'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  capitalizeGroupName,
  type TemplateStepWithGroup,
} from '@/types/diagram/template-step'

const GROUP_KEY_OTHER = 'Other'

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

export type TemplateStepComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  templateSteps: TemplateStepWithGroup[]
  placeholder?: string
  disabled?: boolean
  id?: string
}

const TemplateStepCombobox = ({
  value,
  onValueChange,
  templateSteps,
  placeholder = 'Select a template step',
  disabled = false,
  id,
}: TemplateStepComboboxProps) => {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

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
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-haspopup="listbox"
        aria-label={placeholder}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1',
        )}
      >
        <span className={cn(!selectedStep && 'text-muted-foreground')}>
          {selectedStep ? selectedStep.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div id={`${id}-listbox`} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1">
          <Command shouldFilter className="rounded-md border border-input bg-popover shadow-md">
            <CommandInput ref={searchInputRef} placeholder="Search template steps…" />
            <CommandList>
              <CommandEmpty>No step found.</CommandEmpty>
              {groups.map(([groupKey, steps]) => (
                <CommandGroup
                  key={groupKey}
                  heading={capitalizeGroupName(groupKey)}
                >
                  {steps.map(step => (
                    <CommandItem
                      key={step.id}
                      value={step.name}
                      onSelect={() => handleSelect(step.id)}
                    >
                      {step.name}
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
