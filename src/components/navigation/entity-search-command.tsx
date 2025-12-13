'use client'

import * as React from 'react'
import { useEffect, useState, useMemo } from 'react'
import { CommandEmpty, CommandGroup, CommandItem } from '../ui/command'
import { ActionResponse } from '@/types/form/actionHandler'

export interface EntitySearchCommandProps<T extends { id: string }> {
  searchQuery: string
  entityName: string
  fetchAction: () => Promise<ActionResponse>
  searchKey: keyof T
  getNavigationPath: (entity: T) => string
  icon?: React.ReactNode
  onSelect?: (entity: T) => void
  emptyMessage?: string
}

export function EntitySearchCommand<T extends { id: string }>({
  searchQuery,
  entityName,
  fetchAction,
  searchKey,
  getNavigationPath,
  icon,
  onSelect,
  emptyMessage = `No ${entityName.toLowerCase()} found.`,
}: EntitySearchCommandProps<T>) {
  const [entities, setEntities] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchEntities = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await fetchAction()
        if (isMounted) {
          if (result.status === 200 && result.data) {
            setEntities(result.data as T[])
          } else {
            setError(result.error || 'Failed to fetch entities')
          }
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'An error occurred')
          setIsLoading(false)
        }
      }
    }

    fetchEntities()

    return () => {
      isMounted = false
    }
  }, [fetchAction])

  const filteredEntities = useMemo(() => {
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
  }, [entities, searchQuery, searchKey])

  if (isLoading) {
    return (
      <CommandGroup heading={`Searching ${entityName}...`}>
        <CommandItem disabled>Loading...</CommandItem>
      </CommandGroup>
    )
  }

  if (error) {
    return (
      <CommandGroup heading="Error">
        <CommandItem disabled className="text-destructive">
          {error}
        </CommandItem>
      </CommandGroup>
    )
  }

  if (filteredEntities.length === 0) {
    return <CommandEmpty>{emptyMessage}</CommandEmpty>
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
