import { ChevronDown, Plus } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NewTestCaseMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" className="shrink-0 rounded-xl" />}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        New test case
        <ChevronDown data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/test-cases/create" />} nativeButton={false}>
            From scratch
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/test-cases/create-from-template" />} nativeButton={false}>
            From template
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
