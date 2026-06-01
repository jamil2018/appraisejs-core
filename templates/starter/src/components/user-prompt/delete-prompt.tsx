'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { AlertCircle, Trash, X } from 'lucide-react'
import { useState } from 'react'

export type DeletePromptProps = {
  isDisabled?: boolean
  dialogTitle: string
  dialogDescription: string
  confirmationText: string
  deleteHandler: () => Promise<boolean | void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  confirmLabel?: string
  cancelLabel?: string
}

export default function DeletePrompt({
  isDisabled,
  dialogTitle,
  dialogDescription,
  confirmationText,
  deleteHandler,
  open,
  onOpenChange,
  triggerLabel = 'Delete item',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
}: DeletePromptProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen)
    }

    onOpenChange?.(nextOpen)
  }

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const shouldClose = (await deleteHandler()) !== false

      if (shouldClose) {
        handleOpenChange(false)
      }
    } catch {
      // Keep the dialog open so the caller can surface an error state.
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild disabled={isDisabled}>
          <Button variant="outline" size="icon" aria-label={triggerLabel}>
            <Trash className="size-4" aria-hidden="true" />
            <span className="sr-only">{triggerLabel}</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="border-none">
        <DialogHeader>
          <DialogTitle className="flex items-end gap-2">
            <AlertCircle className="size-5" aria-hidden="true" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="mb-4 flex flex-col gap-2">
          <p className="text-md">{confirmationText}</p>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            className="bg-red-500 hover:bg-red-600"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <span className="flex items-center gap-2 text-white">
              <Trash className="size-4" aria-hidden="true" />
              {isDeleting ? 'Deleting...' : confirmLabel}
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="bg-zinc-700 text-white hover:bg-zinc-800"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            <X className="size-4" aria-hidden="true" />
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
