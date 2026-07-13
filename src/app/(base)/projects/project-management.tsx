'use client'

import { useState, useTransition } from 'react'

import {
  registerTargetProjectAction,
  renameTargetProjectAction,
  selectTargetProjectAction,
} from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

type Project = { id: string; displayName: string; canonicalPath: string; fingerprint: string; lastDetectedAt: Date }

export default function ProjectManagement({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [projectPath, setProjectPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()

  function register() {
    startTransition(async () => {
      const response = await registerTargetProjectAction({ projectPath, displayName })
      setMessage(response.message ?? (response.success ? 'Project registered.' : 'Registration failed.'))
      if (response.success) {
        setProjectPath('')
        setDisplayName('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-semibold">Register workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registration uses the same canonical path, package inspection, fingerprinting, and marker behavior as agent
          project registration.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="project-path">Absolute workspace path</Label>
            <Input
              id="project-path"
              value={projectPath}
              onChange={event => setProjectPath(event.target.value)}
              placeholder="/absolute/path/to/workspace"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-display-name">Display name (optional)</Label>
            <Input
              id="project-display-name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
            />
          </div>
          <Button disabled={isPending || !projectPath.trim()} onClick={register}>
            Register
          </Button>
        </div>
        {message ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Registered projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects are registered yet.</p>
        ) : (
          projects.map(project => <ProjectRow key={project.id} project={project} />)
        )}
      </section>
    </div>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const router = useRouter()
  const [name, setName] = useState(project.displayName)
  const [message, setMessage] = useState<string>()
  const [isPending, startTransition] = useTransition()

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Input
            aria-label={`Display name for ${project.displayName}`}
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <p className="mt-2 truncate text-xs text-muted-foreground" title={project.canonicalPath}>
            {project.canonicalPath}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={project.fingerprint}>
            {project.fingerprint}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={isPending || !name.trim() || name.trim() === project.displayName}
            onClick={() =>
              startTransition(async () => {
                const response = await renameTargetProjectAction({ targetProjectId: project.id, displayName: name })
                setMessage(response.message ?? (response.success ? 'Display name updated.' : 'Rename failed.'))
                if (response.success) router.refresh()
              })
            }
          >
            Rename
          </Button>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const response = await selectTargetProjectAction({ targetProjectId: project.id })
                if (response.success) router.push(`/?project=${encodeURIComponent(project.id)}`)
                else setMessage(response.message)
              })
            }
          >
            Select
          </Button>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </article>
  )
}
