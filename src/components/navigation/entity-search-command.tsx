'use client'

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { CommandGroup, CommandItem } from '../ui/command'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export interface EntitySearchCommandProps<T extends { id: string }> {
  searchQuery: string
  entityName: string
  fetchAction: () => Promise<ActionResponse>
  getEntities: (data: ActionResponseData | undefined) => T[]
  searchKey: keyof T
  icon?: React.ReactNode
  onSelect?: (entity: T) => void
}

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entities: T[] }

export function EntitySearchCommand<T extends { id: string }>({
  searchQuery,
  entityName,
  fetchAction,
  getEntities,
  searchKey,
  icon,
  onSelect,
}: EntitySearchCommandProps<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })

  useEffect(() => {
    let isMounted = true

    const fetchEntities = async () => {
      setState({ status: 'loading' })
      try {
        const result = await fetchAction()
        if (!isMounted) return
        if (result.status === 200) {
          setState({ status: 'ready', entities: getEntities(result.data) })
        } else {
          setState({ status: 'error', message: result.error || 'Failed to fetch entities' })
        }
      } catch (err) {
        if (!isMounted) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'An error occurred',
        })
      }
    }

    void fetchEntities()

    return () => {
      isMounted = false
    }
  }, [fetchAction, getEntities])

  const filteredEntities = useMemo(() => {
    if (state.status !== 'ready') {
      return []
    }
    const entities = state.entities
    if (!searchQuery.trim()) {
      return entities
    }

    const query = searchQuery.toLowerCase()
    return entities.filter(entity => {
      const value = entity[searchKey]
      if (typeof value === 'string') {
        return value.toLowerCase().includes(query)
      }
      return false
    })
  }, [state, searchQuery, searchKey])

  if (state.status === 'loading') {
    return (
      <CommandGroup heading={`Searching ${entityName}...`}>
        <CommandItem disabled>Loading...</CommandItem>
      </CommandGroup>
    )
  }

  if (state.status === 'error') {
    return (
      <CommandGroup heading="Error">
        <CommandItem disabled className="text-destructive">
          {state.message}
        </CommandItem>
      </CommandGroup>
    )
  }

  if (filteredEntities.length === 0) {
    return <></>
  }

  return (
    <CommandGroup heading={`${entityName} Results`}>
      {filteredEntities.map(entity => {
        const displayValue = entity[searchKey]
        return (
          <CommandItem
            key={entity.id}
            value={typeof displayValue === 'string' ? displayValue : entity.id}
            onSelect={() => {
              onSelect?.(entity)
            }}
          >
            {icon}
            <span>{typeof displayValue === 'string' ? displayValue : entity.id}</span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
