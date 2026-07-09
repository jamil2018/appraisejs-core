'use client'

import { useEffect, useState } from 'react'

export function useDebouncedPlanQuery(currentQuery: string, onQueryChange: (value: string) => void) {
  const [queryVal, setQueryVal] = useState(currentQuery)

  useEffect(() => {
    setQueryVal(currentQuery)
  }, [currentQuery])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryVal !== currentQuery) {
        onQueryChange(queryVal)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [queryVal, currentQuery, onQueryChange])

  return { queryVal, setQueryVal }
}
