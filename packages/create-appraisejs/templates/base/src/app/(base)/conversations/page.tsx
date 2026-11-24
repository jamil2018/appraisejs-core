import { ArrowUpRight, SquarePen } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { requireActiveProject } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'
import { listProjectConversations } from '@/services/conversation/conversation-service'
import { ServiceError } from '@/services/shared/errors'

export const metadata: Metadata = { title: 'Chats' }
const pageSize = 30

function parseCursor(value?: string) {
  const result = z.string().uuid().optional().safeParse(value)
  if (!result.success) notFound()
  return result.data
}

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; after?: string }>
}) {
  const { project, after } = await searchParams
  const scope = await requireActiveProject(project)
  const rows = await listProjectConversations({
    targetProjectId: scope.id,
    cursor: parseCursor(after),
    limit: pageSize + 1,
  }).catch(error => {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  })
  const chats = rows.slice(0, pageSize)
  const next = chats[pageSize - 1]
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <CollectionHeader title="Chats">
        <Button nativeButton={false} render={<Link href={withProjectScope('/conversations/new', scope.id)} />}>
          <SquarePen aria-hidden="true" /> New chat
        </Button>
      </CollectionHeader>
      {chats.length ? (
        <ul className="divide-y divide-border rounded-xl border bg-card">
          {chats.map(chat => (
            <li key={chat.id}>
              <Link
                href={withProjectScope(`/conversations/${chat.id}`, scope.id)}
                className="app-focus flex min-h-11 items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm hover:bg-muted"
              >
                <span className="min-w-0 truncate" title={chat.title}>
                  {chat.title}
                </span>
                <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <CollectionEmpty title="No saved chats yet" />
      )}
      {rows.length > pageSize && next && (
        <Link
          className="app-focus w-fit rounded-lg text-sm text-primary hover:underline"
          href={withProjectScope(`/conversations?after=${next.id}`, scope.id)}
        >
          Older chats
        </Link>
      )}
    </div>
  )
}
