'use client'

import { useEffect, useRef, useState } from 'react'
import { getRunningTestRunsCountAction } from '@/actions/dashboard/dashboard-actions'

function clearPollingInterval(pollingRef: React.RefObject<NodeJS.Timeout | null>) {
  if (pollingRef.current) {
    clearInterval(pollingRef.current)
    pollingRef.current = null
  }
}

export function useRunningTestRunsCount(initialCount: number) {
  const [count, setCount] = useState(initialCount)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    clearPollingInterval(pollingRef)

    if (count === 0) {
      return
    }

    pollingRef.current = setInterval(async () => {
      try {
        const { data, error } = await getRunningTestRunsCountAction()
        if (error) {
          console.error('Error polling running test runs count:', error)
          return
        }

        const newCount = data as number
        setCount(newCount)

        if (newCount === 0) {
          clearPollingInterval(pollingRef)
        }
      } catch (error) {
        console.error('Error polling running test runs count:', error)
      }
    }, 2000)

    return () => clearPollingInterval(pollingRef)
  }, [count])

  return count
}
