'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { AlertCircle, Trash, X } from 'lucide-react'
import { useState } from 'react'

export default function DeletePrompt({
  isDisabled,
  dialogTitle,
  dialogDescription,
  confirmationText,
  deleteHandler,
  open,
  onOpenChange,
}: {
  isDisabled?: boolean
  dialogTitle: string
  dialogDescription: string
  confirmationText: string
  deleteHandler: () => Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = open !== undefined ? open : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen

  // Determine if we're in controlled mode (open prop provided)
  const isControlled = open !== undefined

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DialogTrigger asChild disabled={isDisabled}>
          <Button variant="outline" size="icon">
            <Trash className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="border-none">
        <DialogHeader>
          <DialogTitle className="flex items-end gap-2">
            <AlertCircle className="h-5 w-5" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="mb-4 flex flex-col gap-2">
          <h1 className="text-md">{confirmationText}</h1>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            className="bg-red-500 hover:bg-red-600"
            onClick={async () => {
              await deleteHandler()
              setIsOpen(false)
            }}
          >
            <span className="flex items-center gap-2 text-white">
              <Trash className="h-4 w-4" />
              Delete
            </span>
          </Button>
          <DialogClose asChild className="bg-gray-700 text-white hover:bg-gray-800">
            <Button variant="secondary">
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
