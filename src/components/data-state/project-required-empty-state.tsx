import { FolderGit2 } from 'lucide-react'

import RegisterProjectDialog from '@/components/projects/register-project-dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export default function ProjectRequiredEmptyState() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGit2 aria-hidden="true" className="size-6" />
          </EmptyMedia>
          <h1>
            <EmptyTitle>Create your first project</EmptyTitle>
          </h1>
          <EmptyDescription>
            AppraiseJS needs a registered workspace before it can show dashboard metrics or project data.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <RegisterProjectDialog />
        </EmptyContent>
      </Empty>
    </div>
  )
}
