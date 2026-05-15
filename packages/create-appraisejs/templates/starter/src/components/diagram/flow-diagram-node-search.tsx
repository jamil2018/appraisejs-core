'use client'

import type { RefObject } from 'react'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type FlowNodeSearchResult = {
  id: string
  label: string
}

type FlowDiagramNodeSearchProps = {
  isSearchOpen: boolean
  searchQuery: string
  searchInputRef: RefObject<HTMLInputElement | null>
  shouldShowSearchSuggestions: boolean
  nodeSearchResults: FlowNodeSearchResult[]
  onSearchQueryChange: (value: string) => void
  onToggleSearch: () => void
  onSelectResult: (nodeId: string) => void
}

export function FlowDiagramNodeSearch({
  isSearchOpen,
  searchQuery,
  searchInputRef,
  shouldShowSearchSuggestions,
  nodeSearchResults,
  onSearchQueryChange,
  onToggleSearch,
  onSelectResult,
}: FlowDiagramNodeSearchProps) {
  return (
    <div className="relative flex items-start gap-2" data-node-search-root="true">
      <AnimatePresence>
        {isSearchOpen ? (
          <motion.div
            className="flex flex-col items-end"
            initial={{ opacity: 0, x: 14, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 14, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Input
              ref={searchInputRef}
              aria-label="Search nodes"
              value={searchQuery}
              onChange={event => onSearchQueryChange(event.target.value)}
              placeholder="Search labels..."
              className="border-border/70 bg-background/95 h-9 w-56 shadow-md backdrop-blur"
            />
            <AnimatePresence>
              {shouldShowSearchSuggestions ? (
                <motion.div
                  className="border-border/70 mt-2 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  {nodeSearchResults.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {nodeSearchResults.map(result => (
                        <button
                          key={result.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                          onClick={() => onSelectResult(result.id)}
                        >
                          {result.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matching labels</div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onToggleSearch}
              aria-label={isSearchOpen ? 'Close node search' : 'Search nodes'}
            >
              {isSearchOpen ? <X /> : <Search />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{isSearchOpen ? 'Close search' : 'Search nodes'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
