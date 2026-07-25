'use client'

import { useEffect, useState, type RefObject } from 'react'
import { Boxes, MousePointer2, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
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

function ShortcutHint({ shortcutKey }: { shortcutKey: string }) {
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setIsMac(navigator.userAgent.toLowerCase().includes('mac')))
  }, [])

  return (
    <KbdGroup>
      <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>{shortcutKey}</Kbd>
    </KbdGroup>
  )
}

function TooltipWithShortcut({ label, shortcutKey }: { label: string; shortcutKey: string }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <ShortcutHint shortcutKey={shortcutKey} />
    </div>
  )
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
    <div className="absolute right-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap justify-end gap-1.5 sm:right-3 sm:top-3">
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
          shortcutHint={<ShortcutHint shortcutKey="S" />}
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
                className="bg-background/80 size-8"
                onClick={onToggleGroupingSelectionMode}
                aria-label={isGroupingSelectionMode ? 'Exit block selection mode' : 'Select nodes for block'}
              >
                {isGroupingSelectionMode ? <Boxes /> : <MousePointer2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <TooltipWithShortcut
                label={isGroupingSelectionMode ? 'Selection mode' : 'Create block'}
                shortcutKey="B"
              />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-background/80 size-8"
              onClick={onOpenAddNodeDialog}
              aria-label="Add Node"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <TooltipWithShortcut label="Add Node" shortcutKey="C" />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
