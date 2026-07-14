'use client'

import Link from 'next/link'
import { FolderGit2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { selectTargetProjectAction } from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { withProjectScope } from '@/lib/project-scope'

type ProjectOption = {
  id: string
  displayName: string
  canonicalPath: string
}

export default function ProjectSelectionDialog({
  projects,
  returnTo,
}: {
  projects: ProjectOption[]
  returnTo: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function selectProject(project: ProjectOption) {
    startTransition(async () => {
      const response = await selectTargetProjectAction({ targetProjectId: project.id })
      if (!response.success) {
        toast({ title: 'Project selection failed', description: response.message, variant: 'destructive' })
        return
      }
      router.push(withProjectScope(returnTo, project.id))
    })
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-w-xl [&>button]:hidden"
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Select a project</DialogTitle>
          <DialogDescription>
            This page contains project-scoped data. Choose the workspace you want to use before continuing.
          </DialogDescription>
        </DialogHeader>

        {projects.length ? (
          <div className="max-h-80 space-y-2 overflow-y-auto" role="list" aria-label="Registered projects">
            {projects.map(project => (
              <div key={project.id} role="listitem">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start px-4 py-3 text-left"
                  disabled={isPending}
                  onClick={() => selectProject(project)}
                >
                  <FolderGit2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{project.displayName}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {project.canonicalPath}
                    </span>
                  </span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-md border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-sm text-muted-foreground">No projects are registered yet.</p>
            <Button asChild>
              <Link href="/projects">Register a project</Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
