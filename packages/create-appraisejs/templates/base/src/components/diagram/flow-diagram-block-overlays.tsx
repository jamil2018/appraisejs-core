'use client'

import { ViewportPortal } from '@xyflow/react'
import { Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { FlowBlockBounds } from './flow-block-helpers'

type FlowDiagramBlockOverlaysProps = {
  flowBlockBounds: FlowBlockBounds[]
  onRenameBlock: (block: FlowBlockBounds) => void
  onDeleteBlock: (blockId: string) => void
}

export function FlowDiagramBlockOverlays({
  flowBlockBounds,
  onRenameBlock,
  onDeleteBlock,
}: FlowDiagramBlockOverlaysProps) {
  if (flowBlockBounds.length === 0) {
    return null
  }

  return (
    <ViewportPortal>
      {flowBlockBounds.map(block => (
        <div
          key={block.id}
          className="pointer-events-none absolute rounded-lg border border-emerald-400/70 bg-emerald-400/10"
          style={{
            left: block.x,
            top: block.y,
            width: block.width,
            height: block.height,
            zIndex: -1,
          }}
        >
          <div className="bg-background/95 shadow-background/40 pointer-events-auto absolute -top-9 left-2 flex items-center gap-1 rounded-md border border-emerald-300/80 px-2.5 py-1.5 text-sm font-semibold text-foreground shadow-md">
            <span>{block.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => onRenameBlock(block)}
              aria-label={`Rename ${block.name}`}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => onDeleteBlock(block.id)}
              aria-label={`Delete ${block.name}`}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      ))}
    </ViewportPortal>
  )
}
