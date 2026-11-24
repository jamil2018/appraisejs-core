import { MessagesSquare } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { conversationContextHref } from '@/lib/conversation/chat-context'
import type { JourneyRecordReference } from '@/lib/quality-journey/record-context'

export function DiscussRecordLink({ projectId, reference }: { projectId: string; reference: JourneyRecordReference }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={conversationContextHref(projectId, reference)} />}
    >
      <MessagesSquare aria-hidden="true" /> Discuss in chat
    </Button>
  )
}
