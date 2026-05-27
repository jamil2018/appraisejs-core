'use client'

import * as React from 'react'
import { Search } from 'lucide-react'

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

export function PickerBrowseTriggerButton({
  selected,
  summaryWhenSelected,
  placeholder,
  onClick,
}: {
  selected: boolean
  summaryWhenSelected: string
  placeholder: string
  onClick: () => void
}) {
  return (
    <Button type="button" variant="outline" className="justify-between" onClick={onClick}>
      <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
        {selected ? summaryWhenSelected : placeholder}
      </span>
      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Browse</span>
    </Button>
  )
}

export function PickerBrowseDialogFrame({
  open,
  onOpenChange,
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  summaryAside,
  children,
  onCancel,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  summaryAside: React.ReactNode
  children: React.ReactNode
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
            <div className="text-sm text-muted-foreground">{summaryAside}</div>
          </div>

          {children}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
