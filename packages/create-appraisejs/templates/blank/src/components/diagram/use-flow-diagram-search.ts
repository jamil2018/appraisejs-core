'use client'

import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { Node } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import { isAddNodePromptNode, searchFlowNodesByLabel } from './flow-diagram-helpers'

type UseFlowDiagramSearchOptions = {
  enableNodeSearch: boolean
  nodes: Node[]
  onEditNode: (nodeId: string) => void
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance | null>
}

export function useFlowDiagramSearch({
  enableNodeSearch,
  nodes,
  onEditNode,
  flowInstanceRef,
}: UseFlowDiagramSearchOptions) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchHighlightedNodeId, setSearchHighlightedNodeId] = useState<string | null>(null)

  const nodeSearchResults = useMemo(() => searchFlowNodesByLabel(nodes, searchQuery), [nodes, searchQuery])
  const shouldShowSearchSuggestions = enableNodeSearch && isSearchOpen && searchQuery.trim().length >= 3

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
  }, [])

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [])

  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      closeSearch()
      return
    }

    openSearch()
  }, [closeSearch, isSearchOpen, openSearch])

  const clearSearchHighlight = useCallback(() => {
    setSearchHighlightedNodeId(null)
  }, [])

  const handleFlowPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isSearchOpen) {
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[data-node-search-root="true"]')) {
        return
      }

      closeSearch()
    },
    [closeSearch, isSearchOpen],
  )

  const handleSearchResultClick = useCallback(
    (nodeId: string) => {
      const node = nodes.find(node => node.id === nodeId)
      if (!node || isAddNodePromptNode(node)) {
        return
      }

      setSearchHighlightedNodeId(nodeId)
      flowInstanceRef.current?.setCenter(node.position.x + 72, node.position.y + 72, {
        zoom: 1.15,
        duration: 420,
      })
      onEditNode(nodeId)
    },
    [nodes, onEditNode, flowInstanceRef],
  )

  const handlePaneClick = useCallback(() => {
    clearSearchHighlight()
  }, [clearSearchHighlight])

  const handleNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      if (searchHighlightedNodeId && node.id !== searchHighlightedNodeId) {
        clearSearchHighlight()
      }
    },
    [clearSearchHighlight, searchHighlightedNodeId],
  )

  return {
    isSearchOpen,
    searchQuery,
    searchInputRef,
    searchHighlightedNodeId,
    nodeSearchResults,
    shouldShowSearchSuggestions,
    setSearchQuery,
    closeSearch,
    openSearch,
    toggleSearch,
    handleFlowPointerDown,
    handleSearchResultClick,
    handlePaneClick,
    handleNodeClick,
  }
}
