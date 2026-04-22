'use client'

import TagForm from '@/app/(base)/tags/tag-form'
import type { TagFormSubmitAction } from '@/app/(base)/tags/tag-form-helpers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Tag } from '@prisma/client'

type InlineTagCreationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitAction: TagFormSubmitAction
  onSuccess: (tag: Tag) => void | Promise<void>
}

export function InlineTagCreationDialog({
  open,
  onOpenChange,
  onSubmitAction,
  onSuccess,
}: InlineTagCreationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Create Filter Tag</DialogTitle>
          <DialogDescription>Create a new filter tag without leaving the current test case.</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <TagForm
            successTitle="Tag created"
            successMessage="Tag created successfully"
            onSubmitAction={onSubmitAction}
            onSuccess={onSuccess}
            redirectPath={null}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
