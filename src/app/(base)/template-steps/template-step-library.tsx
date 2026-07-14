'use client'

import { TemplateStepType } from '@prisma/client'
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Command,
  Layers3,
  MousePointer2,
  Plus,
  Search,
  Shapes,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'

import { deleteTemplateStepAction } from '@/actions/template-step/template-step-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import DeletePrompt from '@/components/user-prompt/delete-prompt'
import { toast } from '@/hooks/use-toast'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { formatDateTime } from '@/lib/utils'

import type { TemplateStepTableRow } from './template-step-helpers'

type TemplateStepLibraryProps = {
  steps: TemplateStepTableRow[]
}

const PAGE_SIZE = 12

function matchesQuery(step: TemplateStepTableRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    step.name,
    step.description,
    step.signature,
    step.templateStepGroup.name,
    ...step.parameters.map(parameter => parameter.name),
  ].some(value => value?.toLowerCase().includes(normalizedQuery))
}

function Signature({ value }: { value: string }) {
  const parts = value.split(/(\{(?:string|int)\})/g)

  return (
    <code className="break-words font-mono text-sm leading-6 text-zinc-200">
      {parts.map((part, index) =>
        /^\{(?:string|int)\}$/.test(part) ? (
          <span key={`${part}-${index}`} className="bg-primary/10 mx-0.5 rounded px-1.5 py-0.5 text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </code>
  )
}

export default function TemplateStepLibrary({ steps }: TemplateStepLibraryProps) {
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const libraryViewportRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    steps.forEach(step => counts.set(step.templateStepGroup.name, (counts.get(step.templateStepGroup.name) ?? 0) + 1))
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [steps])

  const filteredSteps = useMemo(
    () =>
      steps.filter(
        step => (activeGroup === 'all' || step.templateStepGroup.name === activeGroup) && matchesQuery(step, query),
      ),
    [activeGroup, query, steps],
  )

  const actionCount = steps.filter(step => step.type === TemplateStepType.ACTION).length
  const assertionCount = steps.length - actionCount
  const pageCount = Math.max(1, Math.ceil(filteredSteps.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const paginatedSteps = filteredSteps.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const visibleIds = paginatedSteps.map(step => step.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))

  const toggleSelected = (id: string, selected: boolean) => {
    setSelectedIds(current => (selected ? [...new Set([...current, id])] : current.filter(value => value !== id)))
  }

  const toggleAllVisible = (selected: boolean) => {
    setSelectedIds(current =>
      selected ? [...new Set([...current, ...visibleIds])] : current.filter(id => !visibleIds.includes(id)),
    )
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return false
    const response = await deleteTemplateStepAction(selectedIds)
    if (response.status !== 200) {
      toast({
        title: 'Unable to delete template steps',
        description: response.error || response.message,
        variant: 'destructive',
      })
      return false
    }
    toast({ title: selectedIds.length === 1 ? 'Template step deleted' : 'Template steps deleted' })
    setSelectedIds([])
    return true
  }

  const deleteStep = async (id: string, name: string) => {
    const response = await deleteTemplateStepAction([id])
    if (response.status !== 200) {
      toast({
        title: `Unable to delete ${name}`,
        description: response.error || response.message,
        variant: 'destructive',
      })
      return false
    }
    toast({ title: `${name} deleted` })
    setSelectedIds(current => current.filter(value => value !== id))
    return true
  }

  const selectPage = (nextPage: number) => {
    setPage(nextPage)
    const viewport = libraryViewportRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
    viewport?.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby="step-library-title" className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-[rgba(16,33,56,0.5)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-6">
        <div className="bg-primary/[0.07] absolute -right-8 -top-14 size-44 rounded-full blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-primary">
              <Command className="size-4" aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Authoring vocabulary</p>
            </div>
            <h2 id="step-library-title" className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">
              Step library
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Reusable actions and assertions that keep test cases readable and implementation-ready.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.08] text-center sm:min-w-80">
            {[
              ['Total', steps.length],
              ['Actions', actionCount],
              ['Assertions', assertionCount],
            ].map(([label, count]) => (
              <div key={label} className="bg-[#0c192a] px-3 py-3">
                <p className="text-lg font-semibold tabular-nums text-zinc-100">{count}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[rgba(12,25,42,0.72)] p-3 lg:sticky lg:top-4 lg:h-fit">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Collections</p>
            <Layers3 className="size-3.5 text-zinc-600" aria-hidden="true" />
          </div>
          <nav
            aria-label="Template step groups"
            className="flex min-w-0 gap-1 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          >
            <button
              type="button"
              onClick={() => {
                setActiveGroup('all')
                setPage(1)
              }}
              aria-label="All steps"
              aria-current={activeGroup === 'all' ? 'page' : undefined}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary lg:w-full ${
                activeGroup === 'all' ? 'bg-primary/10 font-medium text-primary' : 'text-zinc-300 hover:bg-white/[0.04]'
              }`}
            >
              <span>All steps</span>
              <span className="text-xs tabular-nums opacity-70">{steps.length}</span>
            </button>
            {groups.map(([group, count]) => (
              <button
                key={group}
                type="button"
                onClick={() => {
                  setActiveGroup(group)
                  setPage(1)
                }}
                aria-label={group}
                aria-current={activeGroup === group ? 'page' : undefined}
                className={`flex shrink-0 items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary lg:w-full ${
                  activeGroup === group
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="truncate">{group}</span>
                <span className="text-xs tabular-nums opacity-70">{count}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[rgba(12,25,42,0.5)]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] bg-black/[0.08] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <label htmlFor="template-step-search" className="sr-only">
                Search template steps
              </label>
              <Input
                id="template-step-search"
                type="search"
                value={query}
                onChange={event => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search steps, groups, or parameters"
                className="h-9 border-white/[0.1] bg-black/[0.14] pl-9"
              />
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/template-steps/create">
                <Plus className="size-4" aria-hidden="true" />
                New template step
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-400">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={value => toggleAllVisible(Boolean(value))}
                aria-label="Select all visible template steps"
              />
              Select visible
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-zinc-500">
                {filteredSteps.length} result{filteredSteps.length === 1 ? '' : 's'}
              </span>
              <DeletePrompt
                isDisabled={selectedIds.length === 0}
                dialogTitle="Delete template steps"
                dialogDescription="This removes the selected reusable definitions."
                confirmationText={`Delete ${selectedIds.length} selected template step${selectedIds.length === 1 ? '' : 's'}?`}
                deleteHandler={deleteSelected}
                triggerLabel="Delete selected template steps"
              />
            </div>
          </div>

          {filteredSteps.length > 0 ? (
            <ScrollArea ref={libraryViewportRef} className="h-[clamp(18rem,calc(100dvh-30rem),40rem)]">
              <div className="grid gap-3 p-3 pr-5 sm:p-4 sm:pr-6 xl:grid-cols-2">
                {paginatedSteps.map(step => {
                  const isAction = step.type === TemplateStepType.ACTION
                  return (
                    <article
                      key={step.id}
                      className="hover:border-primary/25 group relative flex min-h-64 flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-[#0a1626] p-4 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[#0c1b2e] motion-reduce:transform-none sm:p-5"
                    >
                      <Link
                        href={`/template-steps/modify/${step.id}`}
                        aria-label={`Edit ${step.name}`}
                        className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      />
                      <div
                        className="from-primary/60 via-primary/15 absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent"
                        aria-hidden="true"
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="border-primary/20 bg-primary/[0.07] flex size-10 shrink-0 items-center justify-center rounded-md border text-primary">
                            {KeyToIconTransformer(step.icon, 'size-5')}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.11em] text-zinc-500">
                              <span className="text-primary/80">{step.templateStepGroup.name}</span>
                              <span aria-hidden="true">/</span>
                              <span className="flex items-center gap-1">
                                {isAction ? (
                                  <MousePointer2 className="size-3" aria-hidden="true" />
                                ) : (
                                  <CheckCheck className="size-3" aria-hidden="true" />
                                )}
                                {isAction ? 'Action' : 'Assertion'}
                              </span>
                            </div>
                            <h3 className="mt-1.5 text-base font-semibold tracking-tight text-zinc-100">{step.name}</h3>
                          </div>
                        </div>
                        <div className="relative z-20 flex shrink-0 items-center gap-1.5">
                          <Checkbox
                            checked={selectedIds.includes(step.id)}
                            onCheckedChange={value => toggleSelected(step.id, Boolean(value))}
                            aria-label={`Select ${step.name}`}
                          />
                          <DeletePrompt
                            dialogTitle="Delete template step"
                            dialogDescription="This removes the reusable definition."
                            confirmationText={`Delete ${step.name}?`}
                            deleteHandler={() => deleteStep(step.id, step.name)}
                            triggerLabel={`Delete ${step.name}`}
                          />
                        </div>
                      </div>

                      <p
                        className={`mt-4 text-sm leading-6 ${step.description ? 'text-zinc-400' : 'italic text-zinc-600'}`}
                      >
                        {step.description || 'No description provided.'}
                      </p>

                      <div className="mt-4 rounded-md border border-white/[0.07] bg-black/20 px-3.5 py-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                          <ChevronRight className="size-3 text-primary" aria-hidden="true" />
                          Gherkin signature
                        </p>
                        <Signature value={step.signature || ''} />
                      </div>

                      <div className="mt-auto pt-4">
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                          Parameters
                        </p>
                        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
                          {step.parameters.length > 0 ? (
                            step.parameters.map(parameter => (
                              <span
                                key={parameter.id}
                                className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-zinc-400"
                              >
                                {parameter.name}
                              </span>
                            ))
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                              <Shapes className="size-3.5" aria-hidden="true" />
                              No parameters
                            </span>
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[10px] text-zinc-600">
                          <span>Created {formatDateTime(step.createdAt)}</span>
                          <span>Updated {formatDateTime(step.updatedAt)}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <Search className="size-6 text-zinc-600" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-zinc-200">No matching template steps</h3>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                Try another search or choose a different collection.
              </p>
            </div>
          )}
          {filteredSteps.length > 0 && pageCount > 1 && (
            <nav
              aria-label="Template step pagination"
              className="flex items-center justify-between gap-4 border-t border-white/[0.07] bg-black/[0.08] px-4 py-3"
            >
              <p className="text-xs tabular-nums text-zinc-500">
                Page {currentPage} of {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => selectPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => selectPage(currentPage + 1)}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}
