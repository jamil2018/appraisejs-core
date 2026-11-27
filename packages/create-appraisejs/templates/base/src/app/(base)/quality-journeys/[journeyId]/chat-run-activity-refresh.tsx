'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const POLL_INTERVAL_MS = 10_000

export function ChatRunActivityRefresh({ active }: { active: boolean }) {
  const { refresh } = useRouter()

  useEffect(() => {
    if (!active) return
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refreshWhenVisible, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('online', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenVisible)
    }
  }, [active, refresh])

  return null
}
