'use client'

import { Braces, ExternalLink, KeyRound, Pencil, Search, Server, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { deleteEnvironmentAction } from '@/actions/environments/environment-actions'
import TableActions from '@/components/table/table-actions'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import DeletePrompt from '@/components/user-prompt/delete-prompt'
import { toast } from '@/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { identityProviderOriginsFromDiscoveryAuthTransitPolicy } from '@/lib/quality-journey/discovery-auth-transit-display'

import type { EnvironmentTableRow } from './environment-helpers'

type EnvironmentRegistryProps = {
  environments: EnvironmentTableRow[]
}

function includesQuery(environment: EnvironmentTableRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true

  return [
    environment.name,
    environment.baseUrl,
    environment.expectedPageTitle,
    environment.apiBaseUrl,
    environment.username,
  ].some(value => value?.toLowerCase().includes(normalizedQuery))
}

function ExpectedPageTitle({ value }: { value: string | null }) {
  const configured = Boolean(value)
  return (
    <div className="min-w-0 rounded-lg border border-border bg-secondary p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Expected page title</p>
      <p
        className={`mt-2 truncate text-xs ${configured ? 'text-foreground' : 'text-muted-foreground'}`}
        title={value || undefined}
      >
        {value || 'Automatic target identity'}
      </p>
    </div>
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
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
    >
      <h2 id="environment-registry-title" className="sr-only">
        Environment registry
      </h2>

      <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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
            className="h-9 pl-9"
          />
        </div>

        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <label
            htmlFor="environment-select-visible"
            className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground"
          >
            <Checkbox
              id="environment-select-visible"
              checked={allFilteredSelected}
              onCheckedChange={value => toggleAllFiltered(Boolean(value))}
              aria-label="Select all visible environments"
            />
            Select visible
          </label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {filteredEnvironments.length} of {environments.length}
          </span>
          {selectedIds.length > 0 && (
            <DeletePrompt
              isDisabled={selectedIds.length === 0}
              dialogTitle="Delete environments"
              dialogDescription="This removes the selected runtime configurations."
              confirmationText={`Delete ${selectedIds.length} selected environment${selectedIds.length === 1 ? '' : 's'}?`}
              deleteHandler={deleteSelected}
              triggerLabel="Delete selected environments"
            />
          )}
        </div>
      </div>

      {filteredEnvironments.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 p-4 xl:grid-cols-2">
          {filteredEnvironments.map(environment => (
            <article
              key={environment.id}
              className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-input"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                    <Server className="size-5" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Environment
                    </p>
                    <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">
                      {environment.name}
                    </h3>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Checkbox
                    checked={selectedIds.includes(environment.id)}
                    onCheckedChange={value => toggleEnvironment(environment.id, Boolean(value))}
                    aria-label={`Select ${environment.name}`}
                  />
                  <TableActions
                    rowName={environment.name}
                    modifyLink={`/environments/modify/${environment.id}`}
                    deleteHandler={() => deleteEnvironmentAction([environment.id])}
                    editActionText="Edit environment"
                    deleteActionText="Delete environment"
                    editActionIcon={<Pencil className="size-4" aria-hidden="true" />}
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="relative overflow-hidden rounded-lg border border-border bg-secondary px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Primary address
                    </span>
                    <a
                      href={environment.baseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:ring-1 focus-visible:ring-primary"
                      aria-label={`Open ${environment.name} base URL`}
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                  <p className="mt-2 truncate font-mono text-sm text-foreground" title={environment.baseUrl}>
                    {environment.baseUrl}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ExpectedPageTitle value={environment.expectedPageTitle} />
                  <div className="min-w-0 rounded-lg border border-border bg-secondary p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Braces className="size-3.5" aria-hidden="true" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em]">API endpoint</span>
                    </div>
                    <p
                      className={`mt-2 truncate text-xs ${environment.apiBaseUrl ? 'font-mono text-foreground' : 'text-muted-foreground'}`}
                      title={environment.apiBaseUrl || undefined}
                    >
                      {environment.apiBaseUrl || 'Not configured'}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-border bg-secondary p-3 sm:col-span-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em]">
                        Discovery sign-in origins
                      </span>
                    </div>
                    <p className="mt-2 truncate font-mono text-xs text-foreground">
                      {identityProviderOriginsFromDiscoveryAuthTransitPolicy(
                        environment.discoveryAuthTransitPolicyJson,
                      ).join(', ') || 'None authorized'}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-border bg-secondary p-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {environment.username ? (
                        <UserRound className="size-3.5" aria-hidden="true" />
                      ) : (
                        <KeyRound className="size-3.5" aria-hidden="true" />
                      )}
                      <span className="text-[10px] font-medium uppercase tracking-[0.1em]">Access profile</span>
                    </div>
                    <p
                      className={`mt-2 truncate text-xs ${environment.username ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {environment.username || 'No username'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span>Created {formatDateTime(environment.createdAt)}</span>
                <span>Updated {formatDateTime(environment.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center p-4 text-center">
          <Search className="size-6 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">No matching environments</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a different name, endpoint, or username.</p>
        </div>
      )}
    </section>
  )
}
