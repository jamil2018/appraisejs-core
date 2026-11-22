'use client'

import { ViewportPortal } from '@xyflow/react'
import { Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { FlowBlockBounds } from './flow-block-helpers'

type FlowDiagramBlockOverlaysProps = {
  flowBlockBounds: FlowBlockBounds[]
  onEditBlock: (block: FlowBlockBounds) => void
  onDeleteBlock: (blockId: string) => void
}

export function FlowDiagramBlockOverlays({
  flowBlockBounds,
  onEditBlock,
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
          data-flow-block-overlay={block.id}
          className="pointer-events-none absolute rounded-lg border-2 border-dashed border-selection-border bg-selection-surface/40"
          style={{
            left: block.x,
            top: block.y,
            width: block.width,
            height: block.height,
            zIndex: -1,
          }}
        >
          <div className="pointer-events-auto absolute -top-9 left-2 flex items-center gap-1 rounded-lg border border-selection-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground shadow-md shadow-background/40">
            <span>{block.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => onEditBlock(block)}
              aria-label={`Edit ${block.name}`}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 text-danger hover:bg-danger-surface hover:text-danger"
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
