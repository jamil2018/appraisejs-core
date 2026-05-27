'use client'

import * as React from 'react'
import { useEffect, useMemo, useReducer } from 'react'
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

type LoadAction<T> =
  | { type: 'reset' }
  | { type: 'ready'; entities: T[] }
  | { type: 'error'; message: string }

function loadReducer<T>(state: LoadState<T>, action: LoadAction<T>): LoadState<T> {
  switch (action.type) {
    case 'reset':
      return { status: 'loading' }
    case 'ready':
      return { status: 'ready', entities: action.entities }
    case 'error':
      return { status: 'error', message: action.message }
    default:
      return state
  }
}

export function EntitySearchCommand<T extends { id: string }>({
  searchQuery,
  entityName,
  fetchAction,
  getEntities,
  searchKey,
  icon,
  onSelect,
}: EntitySearchCommandProps<T>) {
  const [state, dispatch] = useReducer(loadReducer<T>, { status: 'loading' } satisfies LoadState<T>)

  useEffect(() => {
    let isMounted = true

    const run = async () => {
      dispatch({ type: 'reset' })
      try {
        const result = await fetchAction()
        if (!isMounted) return
        if (result.status === 200) {
          dispatch({ type: 'ready', entities: getEntities(result.data) })
        } else {
          dispatch({ type: 'error', message: result.error || 'Failed to fetch entities' })
        }
      } catch (err) {
        if (!isMounted) return
        dispatch({
          type: 'error',
          message: err instanceof Error ? err.message : 'An error occurred',
        })
      }
    }

    void run()

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
        <CommandItem disabled>Loading…</CommandItem>
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
