import { ChevronDown, Plus } from 'lucide-react'
import Link from 'next/link'
import { withProjectScope } from '@/lib/project-scope'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function NewTestCaseMenu({ projectId }: { projectId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" className="shrink-0 rounded-xl" />}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        New test case
        <ChevronDown data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link href={withProjectScope('/test-cases/create', projectId)} />}
            nativeButton={false}
          >
            From scratch
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href={withProjectScope('/test-cases/create-from-template', projectId)} />}
            nativeButton={false}
          >
            From template
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
