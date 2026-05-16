'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { cn } from '@/lib/utils'
import { capitalizeGroupName, type TemplateStepWithGroup } from '@/types/diagram/template-step'

const GROUP_KEY_OTHER = 'Other'
const MAX_VISIBLE_PARAMETER_BADGES = 4
const SCORE_EXACT_NAME_MATCH = 400
const SCORE_PREFIX_NAME_MATCH = 300
const SCORE_CONTAINS_NAME_MATCH = 200
const SCORE_EXACT_KEYWORD_MATCH = 120
const SCORE_PREFIX_KEYWORD_MATCH = 100
const SCORE_CONTAINS_KEYWORD_MATCH = 80

function groupStepsByGroupName(steps: TemplateStepWithGroup[]): Map<string, TemplateStepWithGroup[]> {
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
  return [step.description, groupKey, ...(step.parameters ?? []).map(parameter => parameter.name)].filter(
    (keyword): keyword is string => typeof keyword === 'string' && keyword.length > 0,
  )
}

function normalizeForSearch(value: string) {
  return value.trim().toLowerCase()
}

function scoreMatch(candidate: string, search: string) {
  if (!search) return 0
  if (candidate === search) return SCORE_EXACT_NAME_MATCH
  if (candidate.startsWith(search)) return SCORE_PREFIX_NAME_MATCH
  if (candidate.includes(search)) return SCORE_CONTAINS_NAME_MATCH
  return 0
}

function getStepSearchScore(step: TemplateStepWithGroup, groupKey: string, search: string) {
  if (!search) return 1

  const normalizedName = normalizeForSearch(step.name)
  const nameScore = scoreMatch(normalizedName, search)
  if (nameScore > 0) return nameScore

  const keywords = buildStepKeywords(step, groupKey).map(keyword => normalizeForSearch(keyword))

  if (keywords.some(keyword => keyword === search)) return SCORE_EXACT_KEYWORD_MATCH
  if (keywords.some(keyword => keyword.startsWith(search))) return SCORE_PREFIX_KEYWORD_MATCH
  if (keywords.some(keyword => keyword.includes(search))) return SCORE_CONTAINS_KEYWORD_MATCH

  return 0
}

function formatParameterLabel(label: string) {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function StepIcon({ icon, className }: { icon: TemplateStepWithGroup['icon']; className?: string }) {
  return (
    <span className="bg-muted/40 flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
      {KeyToIconTransformer(icon, className ?? 'size-4')}
    </span>
  )
}

type TemplateStepComboboxProps = {
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
  const [search, setSearch] = React.useState('')
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const generatedId = React.useId()
  const comboboxId = id ?? generatedId
  const listboxId = `${comboboxId}-listbox`

  const selectedStep = React.useMemo(() => templateSteps.find(s => s.id === value) ?? null, [templateSteps, value])

  const groups = React.useMemo(() => {
    const normalizedSearch = normalizeForSearch(search)
    const scoredSteps = templateSteps.reduce<{ step: TemplateStepWithGroup; groupKey: string; score: number }[]>(
      (steps, step) => {
        const groupKey = step.templateStepGroup?.name ?? GROUP_KEY_OTHER
        const score = getStepSearchScore(step, groupKey, normalizedSearch)
        if (score > 0) {
          steps.push({ step, groupKey, score })
        }

        return steps
      },
      [],
    )

    if (!normalizedSearch) {
      const map = groupStepsByGroupName(scoredSteps.map(({ step }) => step))
      return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }

    scoredSteps.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.step.name.localeCompare(b.step.name, undefined, { sensitivity: 'base' })
    })

    const map = new Map<string, TemplateStepWithGroup[]>()
    for (const { step, groupKey } of scoredSteps) {
      const list = map.get(groupKey) ?? []
      list.push(step)
      map.set(groupKey, list)
    }

    return Array.from(map.entries())
  }, [search, templateSteps])

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
    if (open) return
    setSearch('')
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
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div id={listboxId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1">
          <Command shouldFilter={false} className="rounded-md border border-input bg-popover shadow-md">
            <CommandInput
              ref={searchInputRef}
              placeholder="Search template steps…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {groups.length === 0 ? <CommandEmpty>No step found.</CommandEmpty> : null}
              {groups.map(([groupKey, steps]) => (
                <CommandGroup
                  key={groupKey}
                  heading={
                    <div className="text-muted-foreground/80 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.12em]">
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
                        'data-[selected=true]:border-emerald-500/35 data-[selected=true]:bg-emerald-500/20 data-[selected=true]:text-foreground dark:data-[selected=true]:bg-emerald-500/5',
                      )}
                    >
                      <StepIcon icon={step.icon} className="size-4" />
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
