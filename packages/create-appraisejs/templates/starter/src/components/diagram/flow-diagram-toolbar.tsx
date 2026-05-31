'use client'

import type { RefObject } from 'react'
import { Boxes, MousePointer2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FlowDiagramNodeSearch } from './flow-diagram-node-search'
import type { FlowNodeSearchResult } from './flow-diagram-node-search'

type FlowDiagramToolbarProps = {
  enableNodeSearch: boolean
  enableNodeGrouping: boolean
  isSearchOpen: boolean
  searchQuery: string
  searchInputRef: RefObject<HTMLInputElement | null>
  shouldShowSearchSuggestions: boolean
  nodeSearchResults: FlowNodeSearchResult[]
  isGroupingSelectionMode: boolean
  onSearchQueryChange: (value: string) => void
  onToggleSearch: () => void
  onSearchResultSelect: (nodeId: string) => void
  onToggleGroupingSelectionMode: () => void
  onOpenAddNodeDialog: () => void
}

export function FlowDiagramToolbar({
  enableNodeSearch,
  enableNodeGrouping,
  isSearchOpen,
  searchQuery,
  searchInputRef,
  shouldShowSearchSuggestions,
  nodeSearchResults,
  isGroupingSelectionMode,
  onSearchQueryChange,
  onToggleSearch,
  onSearchResultSelect,
  onToggleGroupingSelectionMode,
  onOpenAddNodeDialog,
}: FlowDiagramToolbarProps) {
  return (
    <div className="absolute right-4 top-4 z-20 flex items-start gap-2">
      {enableNodeSearch ? (
        <FlowDiagramNodeSearch
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          searchInputRef={searchInputRef}
          shouldShowSearchSuggestions={shouldShowSearchSuggestions}
          nodeSearchResults={nodeSearchResults}
          onSearchQueryChange={onSearchQueryChange}
          onToggleSearch={onToggleSearch}
          onSelectResult={onSearchResultSelect}
        />
      ) : null}
      {enableNodeGrouping ? (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isGroupingSelectionMode ? 'default' : 'outline'}
                size="icon"
                onClick={onToggleGroupingSelectionMode}
                aria-label={isGroupingSelectionMode ? 'Exit block selection mode' : 'Select nodes for block'}
              >
                {isGroupingSelectionMode ? <Boxes /> : <MousePointer2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isGroupingSelectionMode ? 'Selection mode' : 'Create block'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" size="icon" onClick={onOpenAddNodeDialog} aria-label="Add Node">
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add Node</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
