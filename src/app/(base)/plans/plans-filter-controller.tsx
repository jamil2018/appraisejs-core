'use client'

import { useTransition, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// fallow-ignore-next-line complexity
function shouldRemoveSearchParam(key: string, value: string | null) {
  return (
    value === null ||
    value === '' ||
    (value === 'all' && key === 'tab') ||
    (value === 'recent' && key === 'sort')
  )
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

// fallow-ignore-next-line complexity
export function PlansFilterController() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentTab = searchParams.get('tab') ?? 'all'
  const currentQuery = searchParams.get('query') ?? ''
  const currentSort = searchParams.get('sort') ?? 'recent'

  const [queryVal, setQueryVal] = useState(currentQuery)

  // Sync state with URL search params if changed externally
  useEffect(() => {
    setQueryVal(currentQuery)
  }, [currentQuery])

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = buildUpdatedSearchParams(searchParams, updates)

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`)
      })
    },
    [searchParams, router, pathname],
  )

  // Debounced query parameter updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryVal !== currentQuery) {
        updateParams({ query: queryVal })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [queryVal, currentQuery, updateParams])

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <Tabs value={currentTab} onValueChange={val => updateParams({ tab: val })} className="w-full md:w-auto">
        <TabsList className="bg-muted/50 flex h-auto flex-wrap gap-1 rounded-lg p-1">
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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:max-w-xl md:flex-1 md:justify-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={queryVal}
            onChange={e => setQueryVal(e.target.value)}
            placeholder="Search plans by goal, description..."
            className="pl-9 pr-8"
          />
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <Select value={currentSort} onValueChange={val => updateParams({ sort: val })}>
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
      </div>
    </div>
  )
}
