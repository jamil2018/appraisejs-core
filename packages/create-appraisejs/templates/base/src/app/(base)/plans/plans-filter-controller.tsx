'use client'

import type { ReactNode } from 'react'
import { useTransition, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import { parsePlansListSearchParams } from './plans-page-helpers'
import { useDebouncedPlanQuery } from './use-debounced-plan-query'

const REMOVED_PARAM_VALUES: Record<string, Set<string>> = {
  tab: new Set(['all']),
  sort: new Set(['recent']),
}

function shouldRemoveSearchParam(key: string, value: string | null) {
  if (value === null || value === '') return true
  return REMOVED_PARAM_VALUES[key]?.has(value) ?? false
}

function buildUpdatedSearchParams(current: URLSearchParams, updates: Record<string, string | null>) {
  const params = new URLSearchParams(current.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (shouldRemoveSearchParam(key, value)) {
      params.delete(key)
    } else if (value !== null) {
      params.set(key, value)
    }
  }
  return params
}

function readPlansFilterParams(searchParams: URLSearchParams) {
  return parsePlansListSearchParams({
    tab: searchParams.get('tab') ?? undefined,
    query: searchParams.get('query') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  })
}

export function PlansFilterController() {
  const { push } = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const { tab: currentTab, query: currentQuery, sort: currentSort } = readPlansFilterParams(searchParams)

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = buildUpdatedSearchParams(searchParams, updates)
      startTransition(() => {
        push(`${pathname}?${params.toString()}`)
      })
    },
    [searchParams, push, pathname],
  )

  const { queryVal, setQueryVal } = useDebouncedPlanQuery(currentQuery, value => updateParams({ query: value }))

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-[rgba(18,37,64,0.42)] p-2.5 shadow-none lg:flex-row lg:items-center lg:justify-between"
      aria-label="Plan filters"
    >
      <div className="min-w-0 flex-1">
        <PlansStatusTabs currentTab={currentTab} onTabChange={tab => updateParams({ tab })} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:w-[38rem] lg:justify-end">
        <PlansSearchInput queryVal={queryVal} isPending={isPending} onQueryChange={setQueryVal} />
        <PlansSortSelect currentSort={currentSort} onSortChange={sort => updateParams({ sort })} />
      </div>
    </section>
  )
}

function PlansStatusTabs({ currentTab, onTabChange }: { currentTab: string; onTabChange: (tab: string) => void }) {
  return (
    <Tabs value={currentTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-md border border-white/[0.06] bg-black/10 p-1">
        <PlansTabTrigger value="all">All</PlansTabTrigger>
        <PlansTabTrigger value="draft">Draft</PlansTabTrigger>
        <PlansTabTrigger value="awaiting_review">Awaiting Review</PlansTabTrigger>
        <PlansTabTrigger value="approved">Approved</PlansTabTrigger>
        <PlansTabTrigger value="in_progress">In Progress</PlansTabTrigger>
        <PlansTabTrigger value="completed">Completed</PlansTabTrigger>
      </TabsList>
    </Tabs>
  )
}

function PlansTabTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'shrink-0 rounded px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors',
        'data-[state=active]:bg-white/[0.08] data-[state=active]:text-zinc-100 data-[state=active]:shadow-none',
      )}
    >
      {children}
    </TabsTrigger>
  )
}

function PlansSearchInput({
  queryVal,
  isPending,
  onQueryChange,
}: {
  queryVal: string
  isPending: boolean
  onQueryChange: (value: string) => void
}) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={queryVal}
        onChange={event => onQueryChange(event.target.value)}
        placeholder="Search plans by goal, description..."
        className="focus-visible:border-primary/35 h-10 border-white/[0.1] bg-black/10 pl-9 pr-8 text-sm shadow-none placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-primary"
      />
      {isPending ? (
        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  )
}

function PlansSortSelect({ currentSort, onSortChange }: { currentSort: string; onSortChange: (sort: string) => void }) {
  return (
    <Select value={currentSort} onValueChange={onSortChange}>
      <SelectTrigger className="focus:border-primary/35 h-10 w-full border-white/[0.1] bg-black/10 text-sm shadow-none focus:ring-1 focus:ring-primary sm:w-[180px]">
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="recent">Most Recent</SelectItem>
        <SelectItem value="revision">Revision Number</SelectItem>
        <SelectItem value="tasks">Task Count</SelectItem>
        <SelectItem value="goal">Goal (A-Z)</SelectItem>
      </SelectContent>
    </Select>
  )
}
