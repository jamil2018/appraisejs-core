'use client'

import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash, Eye } from 'lucide-react'
import { Button } from '../ui/button'
import Link from 'next/link'

import { ActionResponse } from '@/types/form/actionHandler'
import { toast } from '@/hooks/use-toast'

const TableActions = ({
  modifyLink,
  deleteHandler,
  viewLink,
  viewActionText = 'View',
  editActionText = 'Edit',
  deleteActionText = 'Delete',
  editActionIcon = <Pencil className="h-4 w-4" />,
  deleteActionIcon = <Trash className="h-4 w-4" />,
  viewActionIcon = <Eye className="h-4 w-4" />,
}: {
  modifyLink: string
  deleteHandler: () => Promise<ActionResponse>
  editActionText?: string
  deleteActionText?: string
  editActionIcon?: React.ReactNode
  deleteActionIcon?: React.ReactNode
  viewActionText?: string
  viewActionIcon?: React.ReactNode
  viewLink?: string
}) => {
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
          {viewLink && (
            <DropdownMenuItem>
              <Link href={viewLink}>
                <span className="flex items-center gap-2">
                  {viewActionIcon} {viewActionText}
                </span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem>
            <Link href={modifyLink}>
              <span className="flex items-center gap-2">
                {editActionIcon} {editActionText}
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              const res = await deleteHandler()
              if (res.status === 200) {
                toast({
                  title: 'Item(s) deleted successfully',
                })
              } else {
                toast({
                  title: 'Error deleting item(s)',
                  description: res.error,
                })
              }
            }}
          >
            <span className="flex items-center gap-2">
              {deleteActionIcon} {deleteActionText}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default TableActions
