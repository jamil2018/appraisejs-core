'use client'

import React, { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash, Eye, CheckCircleIcon, XCircle } from 'lucide-react'
import { Button } from '../ui/button'
import Link from 'next/link'

import { ActionResponse } from '@/types/form/actionHandler'
import { toast } from '@/hooks/use-toast'

const TableActions = ({
  modifyLink,
  resolveConflictsHandler,
  deleteHandler,
  viewLink,
  showCancelButton = false,
  cancelHandler,
  cancelButtonDisabled = false,
  deleteButtonDisabled = false,
  viewActionText = 'View',
  editActionText = 'Edit',
  deleteActionText = 'Delete',
  cancelActionText = 'Cancel',
  editActionIcon = <Pencil className="h-4 w-4" />,
  deleteActionIcon = <Trash className="h-4 w-4" />,
  viewActionIcon = <Eye className="h-4 w-4" />,
  cancelActionIcon = <XCircle className="h-4 w-4" />,
}: {
  modifyLink?: string
  deleteHandler: () => Promise<ActionResponse>
  resolveConflictsHandler?: () => Promise<ActionResponse>
  editActionText?: string
  deleteActionText?: string
  editActionIcon?: React.ReactNode
  deleteActionIcon?: React.ReactNode
  viewActionText?: string
  viewActionIcon?: React.ReactNode
  viewLink?: string
  showCancelButton?: boolean
  cancelHandler?: () => Promise<ActionResponse>
  cancelButtonDisabled?: boolean
  cancelActionText?: string
  cancelActionIcon?: React.ReactNode
  deleteButtonDisabled?: boolean
}) => {
  const [isCancelling, setIsCancelling] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showCancelButton && (
            <DropdownMenuItem
              disabled={cancelButtonDisabled || isCancelling}
              onClick={async () => {
                if (!cancelHandler) return
                setIsCancelling(true)
                try {
                  const res = await cancelHandler()
                  if (res.status === 200) {
                    toast({
                      title: 'Test run cancellation requested',
                      description: res.message || 'The test run is being cancelled.',
                    })
                  } else {
                    toast({
                      title: 'Error cancelling test run',
                      description: res.error || res.message,
                      variant: 'destructive',
                    })
                    setIsCancelling(false)
                  }
                } catch (error) {
                  toast({
                    title: 'Error cancelling test run',
                    description: error instanceof Error ? error.message : 'An unexpected error occurred',
                    variant: 'destructive',
                  })
                  setIsCancelling(false)
                }
              }}
            >
              <span className="flex items-center gap-2">
                {cancelActionIcon} {cancelActionText}
              </span>
            </DropdownMenuItem>
          )}
          {viewLink && (
            <DropdownMenuItem>
              <Link href={viewLink}>
                <span className="flex items-center gap-2">
                  {viewActionIcon} {viewActionText}
                </span>
              </Link>
            </DropdownMenuItem>
          )}
          {modifyLink && (
            <DropdownMenuItem>
              <Link href={modifyLink}>
                <span className="flex items-center gap-2">
                  {editActionIcon} {editActionText}
                </span>
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            disabled={deleteButtonDisabled}
            onClick={async () => {
              const res = await deleteHandler()
              if (res.status === 200) {
                toast({
                  title: 'Item(s) deleted successfully',
                })
              } else {
                toast({
                  title: `${res.message}`,
                  description: res.error,
                })
              }
            }}
          >
            <span className="flex items-center gap-2">
              {deleteActionIcon} {deleteActionText}
            </span>
          </DropdownMenuItem>
          {resolveConflictsHandler && (
            <DropdownMenuItem>
              <span className="flex items-center gap-2" onClick={resolveConflictsHandler}>
                <CheckCircleIcon className="h-4 w-4" /> Mark conflicts as resolved
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default TableActions
