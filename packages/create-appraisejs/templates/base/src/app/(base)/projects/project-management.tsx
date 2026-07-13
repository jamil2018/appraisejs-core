'use client'

import { ArrowRight, FolderGit2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  deleteTargetProjectAction,
  registerTargetProjectAction,
  renameTargetProjectAction,
  selectTargetProjectAction,
} from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

type Project = {
  id: string
  displayName: string
  description: string | null
  canonicalPath: string
  lastDetectedAt: Date
}

const projectDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export default function ProjectManagement({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState('')
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return projects
    return projects.filter(project =>
      [project.displayName, project.description ?? '', project.canonicalPath].some(value =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    )
  }, [projects, query])

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Registered projects</CardTitle>
          <CardDescription>Search, select, rename, or permanently remove registered workspaces.</CardDescription>
        </div>
        <RegisterProjectDialog />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search registered projects"
            className="pl-9"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search projects..."
            type="search"
          />
        </div>

        {projects.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
            <FolderGit2 aria-hidden="true" className="size-8 text-muted-foreground" />
            <p className="font-medium">No projects registered</p>
            <p className="text-sm text-muted-foreground">Register a workspace to begin.</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground" role="status">
            No projects match “{query}”.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Workspace path</TableHead>
                <TableHead>Last detected</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map(project => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function RegisterProjectDialog() {
  const { refresh } = useRouter()
  const [open, setOpen] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()

  function register() {
    startTransition(async () => {
      const response = await registerTargetProjectAction({ projectPath, displayName, description })
      if (!response.success) {
        toast({ title: 'Project registration failed', description: response.message, variant: 'destructive' })
        return
      }
      setProjectPath('')
      setDisplayName('')
      setDescription('')
      setOpen(false)
      toast({ title: 'Project registered' })
      refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" data-icon="inline-start" />
        Register project
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register workspace</DialogTitle>
          <DialogDescription>
            Registration uses the same canonical inspection and marker flow as agent project setup.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-path">Absolute workspace path</Label>
            <Input
              id="project-path"
              value={projectPath}
              onChange={event => setProjectPath(event.target.value)}
              placeholder="/absolute/path/to/workspace"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-display-name">Display name</Label>
            <Input
              id="project-display-name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="What is this workspace used for?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isPending || !projectPath.trim() || !displayName.trim()} onClick={register}>
            {isPending ? 'Registering...' : 'Register project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const { push } = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <TableRow>
      <TableCell className="min-w-64">
        <p className="font-medium">{project.displayName}</p>
        {project.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-md truncate font-mono text-xs" title={project.canonicalPath}>
        {project.canonicalPath}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {projectDateFormatter.format(new Date(project.lastDetectedAt))}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <EditProjectDialog project={project} />
          <Button
            aria-label={`Select ${project.displayName}`}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const response = await selectTargetProjectAction({ targetProjectId: project.id })
                if (response.success) push(`/?project=${encodeURIComponent(project.id)}`)
                else toast({ title: 'Project selection failed', description: response.message, variant: 'destructive' })
              })
            }
            size="icon"
            title="Select project"
          >
            <ArrowRight aria-hidden="true" />
          </Button>
          <DeleteProjectDialog project={project} />
        </div>
      </TableCell>
    </TableRow>
  )
}

function EditProjectDialog({ project }: { project: Project }) {
  const { refresh } = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(project.displayName)
  const [description, setDescription] = useState(project.description ?? '')
  const [isPending, startTransition] = useTransition()

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setName(project.displayName)
      setDescription(project.description ?? '')
    }
  }

  function save() {
    startTransition(async () => {
      const response = await renameTargetProjectAction({ targetProjectId: project.id, displayName: name, description })
      if (!response.success) {
        toast({ title: 'Project rename failed', description: response.message, variant: 'destructive' })
        return
      }
      setOpen(false)
      toast({ title: 'Project renamed' })
      refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <Button
        aria-label={`Rename ${project.displayName}`}
        variant="outline"
        onClick={() => setOpen(true)}
        size="icon"
        title="Rename project"
      >
        <Pencil aria-hidden="true" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            Only project metadata changes. The canonical path, project ID, and ownership history stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`project-name-${project.id}`}>Display name</Label>
          <Input id={`project-name-${project.id}`} value={name} onChange={event => setName(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`project-description-${project.id}`}>Description (optional)</Label>
          <Textarea
            id={`project-description-${project.id}`}
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="What is this workspace used for?"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button disabled={isPending || !name.trim()} onClick={save}>
            {isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteProjectDialog({ project }: { project: Project }) {
  const { refresh } = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [isPending, startTransition] = useTransition()

  function removeProject() {
    startTransition(async () => {
      const response = await deleteTargetProjectAction({ targetProjectId: project.id })
      if (!response.success) {
        toast({ title: 'Project removal failed', description: response.message, variant: 'destructive' })
        return
      }
      setOpen(false)
      toast({ title: 'Project removed', description: `${project.displayName} and its associated data were deleted.` })
      refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen)
        if (!nextOpen) setConfirmation('')
      }}
    >
      <Button
        aria-label={`Remove ${project.displayName}`}
        onClick={() => setOpen(true)}
        size="icon"
        title="Remove project"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {project.displayName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the project and all associated authored data, plans, runs, reports, logs, metrics,
            evidence, and supporting records. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`confirm-delete-${project.id}`}>
            Type <span className="font-semibold text-foreground">{project.displayName}</span> to confirm
          </Label>
          <Input
            id={`confirm-delete-${project.id}`}
            autoComplete="off"
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || confirmation !== project.displayName}
            onClick={removeProject}
          >
            {isPending ? 'Removing...' : 'Remove project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
