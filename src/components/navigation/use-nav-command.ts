'use client'

import { useEffect, useRef, useState } from 'react'

import type { SearchCommandMode } from './nav-command-helpers'

export function useNavCommand() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [commandMode, setCommandMode] = useState<SearchCommandMode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setIsMac(navigator.userAgent.toLowerCase().includes('mac')))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        const visibleTrigger = Array.from(document.querySelectorAll('[data-nav-command-trigger]')).find(
          trigger => trigger.getClientRects().length > 0,
        )
        if (visibleTrigger && visibleTrigger !== triggerRef.current) return
        event.preventDefault()
        if (!open && document.activeElement instanceof HTMLElement) {
          returnFocusRef.current = document.activeElement
        }
        setOpen(!open)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setCommandMode(null)
        setSearchQuery('')
      })
    }
  }, [open])

  const clearSearchMode = () => {
    setCommandMode(null)
    setSearchQuery('')
  }

  const selectSearchMode = (nextMode: SearchCommandMode) => {
    setCommandMode(nextMode)
    setSearchQuery('')
  }

  return {
    triggerRef,
    returnFocusRef,
    open,
    setOpen,
    commandMode,
    searchQuery,
    setSearchQuery,
    isMac,
    clearSearchMode,
    selectSearchMode,
  }
}
