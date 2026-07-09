'use client'

import { useTransition, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <PlansStatusTabs currentTab={currentTab} onTabChange={tab => updateParams({ tab })} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:max-w-xl md:flex-1 md:justify-end">
        <PlansSearchInput queryVal={queryVal} isPending={isPending} onQueryChange={setQueryVal} />
        <PlansSortSelect currentSort={currentSort} onSortChange={sort => updateParams({ sort })} />
      </div>
    </div>
  )
}

function PlansStatusTabs({ currentTab, onTabChange }: { currentTab: string; onTabChange: (tab: string) => void }) {
  return (
    <Tabs value={currentTab} onValueChange={onTabChange} className="w-full md:w-auto">
      <TabsList className="flex h-auto flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-[rgba(18,37,64,0.32)] p-1 backdrop-blur-md">
        <TabsTrigger value="all" className="rounded-md px-3 py-1.5 text-xs font-medium">
          All
        </TabsTrigger>
        <TabsTrigger value="draft" className="rounded-md px-3 py-1.5 text-xs font-medium">
          Draft
        </TabsTrigger>
        <TabsTrigger value="awaiting_review" className="rounded-md px-3 py-1.5 text-xs font-medium">
          Awaiting Review
        </TabsTrigger>
        <TabsTrigger value="approved" className="rounded-md px-3 py-1.5 text-xs font-medium">
          Approved
        </TabsTrigger>
        <TabsTrigger value="in_progress" className="rounded-md px-3 py-1.5 text-xs font-medium">
          In Progress
        </TabsTrigger>
        <TabsTrigger value="completed" className="rounded-md px-3 py-1.5 text-xs font-medium">
          Completed
        </TabsTrigger>
      </TabsList>
    </Tabs>
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
        className="pl-9 pr-8"
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
      <SelectTrigger className="w-full sm:w-[180px]">
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
