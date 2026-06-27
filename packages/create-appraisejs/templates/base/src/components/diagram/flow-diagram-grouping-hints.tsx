'use client'

import { Button } from '@/components/ui/button'

type FlowDiagramGroupingHintsProps = {
  showCreateBlock: boolean
  showOrphanMessage: boolean
  orphanMessage: string
  onCreateBlock: () => void
}

export function FlowDiagramGroupingHints({
  showCreateBlock,
  showOrphanMessage,
  orphanMessage,
  onCreateBlock,
}: FlowDiagramGroupingHintsProps) {
  if (!showCreateBlock && !showOrphanMessage) {
    return null
  }

  return (
    <>
      {showCreateBlock ? (
        <div className="absolute right-4 top-16 z-20 rounded-md border border-border bg-popover p-2 shadow-xl">
          <Button type="button" size="sm" onClick={onCreateBlock}>
            Create block
          </Button>
        </div>
      ) : null}
      {showOrphanMessage ? (
        <div className="absolute right-4 top-16 z-20 max-w-64 rounded-md border border-border bg-popover p-3 text-sm text-muted-foreground shadow-xl">
          {orphanMessage}
        </div>
      ) : null}
    </>
  )
}
