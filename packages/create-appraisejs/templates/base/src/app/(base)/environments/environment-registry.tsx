'use client'

import Link from 'next/link'
import { Braces, ExternalLink, KeyRound, Pencil, Plus, Search, Server, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { deleteEnvironmentAction } from '@/actions/environments/environment-actions'
import TableActions from '@/components/table/table-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import DeletePrompt from '@/components/user-prompt/delete-prompt'
import { toast } from '@/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'

import type { EnvironmentTableRow } from './environment-helpers'

type EnvironmentRegistryProps = {
  environments: EnvironmentTableRow[]
}

function includesQuery(environment: EnvironmentTableRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [environment.name, environment.baseUrl, environment.apiBaseUrl, environment.username].some(value =>
    value?.toLowerCase().includes(normalizedQuery),
  )
}

export default function EnvironmentRegistry({ environments }: EnvironmentRegistryProps) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const filteredEnvironments = useMemo(
    () => environments.filter(environment => includesQuery(environment, query)),
    [environments, query],
  )
  const filteredIds = filteredEnvironments.map(environment => environment.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id))

  const toggleEnvironment = (id: string, selected: boolean) => {
    setSelectedIds(current => (selected ? [...new Set([...current, id])] : current.filter(value => value !== id)))
  }

  const toggleAllFiltered = (selected: boolean) => {
    setSelectedIds(current =>
      selected ? [...new Set([...current, ...filteredIds])] : current.filter(id => !filteredIds.includes(id)),
    )
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return false

    const response = await deleteEnvironmentAction(selectedIds)
    if (response.status !== 200) {
      toast({
        title: 'Unable to delete environments',
        description: response.error || response.message,
        variant: 'destructive',
      })
      return false
    }

    toast({ title: selectedIds.length === 1 ? 'Environment deleted' : 'Environments deleted' })
    setSelectedIds([])
    return true
  }

  return (
    <section
      aria-labelledby="environment-registry-title"
      className="overflow-hidden rounded-lg border border-white/[0.08] bg-[rgba(18,37,64,0.32)] shadow-[0_18px_45px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="flex flex-col gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="environment-registry-title" className="text-base font-semibold text-foreground">
            Runtime registry
          </h2>
          <p className="mt-1 text-sm text-zinc-400">Endpoints and access profiles available to test execution.</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/environments/create">
            <Plus className="size-4" aria-hidden="true" />
            New environment
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-b border-white/[0.07] bg-black/[0.08] px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <label htmlFor="environment-search" className="sr-only">
            Search environments
          </label>
          <Input
            id="environment-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search name, endpoint, or username"
            className="h-9 border-white/[0.1] bg-black/[0.12] pl-9"
          />
        </div>

        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-400">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={value => toggleAllFiltered(Boolean(value))}
              aria-label="Select all visible environments"
            />
            Select visible
          </label>
          <span className="text-xs tabular-nums text-zinc-500">
            {filteredEnvironments.length} of {environments.length}
          </span>
          <DeletePrompt
            isDisabled={selectedIds.length === 0}
            dialogTitle="Delete environments"
            dialogDescription="This removes the selected runtime configurations."
            confirmationText={`Delete ${selectedIds.length} selected environment${selectedIds.length === 1 ? '' : 's'}?`}
            deleteHandler={deleteSelected}
            triggerLabel="Delete selected environments"
          />
        </div>
      </div>

      {filteredEnvironments.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 xl:grid-cols-2">
          {filteredEnvironments.map(environment => (
            <article
              key={environment.id}
              className="hover:border-primary/20 group relative min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[rgba(10,20,34,0.82)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[rgba(15,30,49,0.94)] motion-reduce:transform-none sm:p-5"
            >
              <div className="from-primary/60 via-primary/15 absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="border-primary/25 bg-primary/[0.08] flex size-11 shrink-0 items-center justify-center rounded-lg border text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    <Server className="size-5" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">Environment</p>
                    <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-zinc-100">
                      {environment.name}
                    </h3>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Checkbox
                    checked={selectedIds.includes(environment.id)}
                    onCheckedChange={value => toggleEnvironment(environment.id, Boolean(value))}
                    aria-label={`Select ${environment.name}`}
                  />
                  <TableActions
                    modifyLink={`/environments/modify/${environment.id}`}
                    deleteHandler={() => deleteEnvironmentAction([environment.id])}
                    editActionText="Edit environment"
                    deleteActionText="Delete environment"
                    editActionIcon={<Pencil className="size-4" aria-hidden="true" />}
                  />
                </div>
              </div>

              <div className="mt-6">
                <div className="border-primary/15 bg-primary/[0.035] relative overflow-hidden rounded-md border px-4 py-3.5">
                  <div className="bg-primary/50 absolute bottom-0 left-0 top-0 w-0.5" />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                      Primary address
                    </span>
                    <a
                      href={environment.baseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm text-zinc-500 outline-none transition-colors hover:text-primary focus-visible:ring-1 focus-visible:ring-primary"
                      aria-label={`Open ${environment.name} base URL`}
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="mt-2 truncate font-mono text-sm text-zinc-100" title={environment.baseUrl}>
                    {environment.baseUrl}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.018] px-3.5 py-3">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <Braces className="size-3.5" aria-hidden="true" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em]">API endpoint</span>
                    </div>
                    <p
                      className={`mt-2 truncate text-xs ${environment.apiBaseUrl ? 'font-mono text-zinc-300' : 'text-zinc-500'}`}
                      title={environment.apiBaseUrl || undefined}
                    >
                      {environment.apiBaseUrl || 'Not configured'}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-md border border-white/[0.06] bg-white/[0.018] px-3.5 py-3">
                    <div className="flex items-center gap-2 text-zinc-500">
                      {environment.username ? (
                        <UserRound className="size-3.5" aria-hidden="true" />
                      ) : (
                        <KeyRound className="size-3.5" aria-hidden="true" />
                      )}
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em]">Access profile</span>
                    </div>
                    <p className={`mt-2 truncate text-xs ${environment.username ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {environment.username || 'No username'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5 text-[11px] text-zinc-500">
                <span>Created {formatDateTime(environment.createdAt)}</span>
                <span>Updated {formatDateTime(environment.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
          <Search className="size-6 text-zinc-600" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-zinc-200">No matching environments</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">Try a different name, endpoint, or username.</p>
        </div>
      )}
    </section>
  )
}
