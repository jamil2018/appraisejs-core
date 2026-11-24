import type { Metadata } from 'next'
import PageHeader from '@/components/typography/page-header'
import { requireActiveProject } from '@/lib/active-project'

import { JourneyChatFocus } from '../../quality-journeys/[journeyId]/journey-chat-focus'
import { loadChatAttachment, type ContextParams } from '../chat-attachment'
import { ConversationComposer } from '../conversation-composer'

export const metadata: Metadata = { title: 'New chat' }

export default async function NewConversationPage({ searchParams }: { searchParams: Promise<ContextParams> }) {
  const params = await searchParams
  const project = await requireActiveProject(params.project)
  const context = await loadChatAttachment(project.id, params)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:pt-12">
      <PageHeader>What are you working on?</PageHeader>
      {context?.kind === 'QUALITY_JOURNEY' && <JourneyChatFocus projectId={project.id} journeyId={context.id} />}
      <ConversationComposer
        key={JSON.stringify([project.id, context])}
        projectId={project.id}
        initialContext={context}
      />
      <p className="text-sm text-muted-foreground">
        Ask for test cases, suites, templates, runs, or reports in this project.
      </p>
    </div>
  )
}
