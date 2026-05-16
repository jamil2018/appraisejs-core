'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type FlowDiagramBlockDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingBlockId: string | null
  blockName: string
  onBlockNameChange: (value: string) => void
  onSubmit: () => void
}

export function FlowDiagramBlockDialog({
  open,
  onOpenChange,
  editingBlockId,
  blockName,
  onBlockNameChange,
  onSubmit,
}: FlowDiagramBlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingBlockId ? 'Rename block' : 'Create block'}</DialogTitle>
          <DialogDescription>
            {editingBlockId
              ? 'Update the display name for this flow block.'
              : 'Name the selected nodes before saving them as a flow block.'}
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Block name"
          value={blockName}
          onChange={event => onBlockNameChange(event.target.value)}
          placeholder="Block name"
        />
        <DialogFooter>
          <Button type="button" onClick={onSubmit}>
            {editingBlockId ? 'Rename' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
