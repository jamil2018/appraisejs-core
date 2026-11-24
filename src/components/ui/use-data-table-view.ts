'use client'

import { functionalUpdate, type OnChangeFn, type TableState, type VisibilityState } from '@tanstack/react-table'
import { useEffect, useRef, useState } from 'react'

type DataTableView = Pick<TableState, 'columnFilters' | 'columnVisibility' | 'pagination' | 'rowSelection' | 'sorting'>
type ScrollPosition = { pageTop: number; tableLeft: number }

const views = new Map<string, DataTableView>()
const scrollPositions = new Map<string, ScrollPosition>()
const maxRememberedViews = 24

function defaultView(columnVisibility?: VisibilityState): DataTableView {
  return {
    columnFilters: [],
    columnVisibility: columnVisibility ?? {},
    pagination: { pageIndex: 0, pageSize: 10 },
    rowSelection: {},
    sorting: [],
  }
}

function rememberView(key: string, state: DataTableView) {
  views.delete(key)
  views.set(key, state)
  if (views.size <= maxRememberedViews) return
  const oldestKey = views.keys().next().value
  if (oldestKey === undefined) return
  views.delete(oldestKey)
  scrollPositions.delete(oldestKey)
}

function useTableScroll(key?: string) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const table = ref.current
    if (!key || !table) return
    const position = scrollPositions.get(key)
    const savePosition = () => {
      scrollPositions.set(key, { pageTop: window.scrollY, tableLeft: table.scrollLeft })
    }
    const restoreFrame = requestAnimationFrame(() => {
      if (position) {
        window.scrollTo({ top: position.pageTop, behavior: 'instant' })
        table.scrollLeft = position.tableLeft
      }
      table.addEventListener('scroll', savePosition, { passive: true })
      window.addEventListener('scroll', savePosition, { passive: true })
    })

    return () => {
      cancelAnimationFrame(restoreFrame)
      table.removeEventListener('scroll', savePosition)
      window.removeEventListener('scroll', savePosition)
    }
  }, [key])

  return ref
}

export function useDataTableView(key?: string, initialColumnVisibility?: VisibilityState) {
  const [state, setState] = useState(() => (key ? views.get(key) : undefined) ?? defaultView(initialColumnVisibility))
  const scrollRef = useTableScroll(key)

  useEffect(() => {
    if (key) rememberView(key, state)
  }, [key, state])

  function update<K extends keyof DataTableView>(field: K): OnChangeFn<DataTableView[K]> {
    return updater => {
      setState(current => ({ ...current, [field]: functionalUpdate(updater, current[field]) }))
    }
  }

  return { state, update, scrollRef }
}
