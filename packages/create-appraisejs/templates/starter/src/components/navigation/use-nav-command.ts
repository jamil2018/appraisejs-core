'use client'

import { useEffect, useState } from 'react'

import type { SearchCommandMode } from './nav-command-helpers'

export function useNavCommand() {
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
        event.preventDefault()
        setOpen(currentOpen => !currentOpen)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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
