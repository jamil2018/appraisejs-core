'use client'

import { ArrowRight, CircleCheck, CircleHelp, CircleX, FolderGit2, Pencil, Search, Trash2 } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  deleteTargetProjectAction,
  renameTargetProjectAction,
  selectTargetProjectAction,
} from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import RegisterProjectDialog from '@/components/projects/register-project-dialog'
import { Badge } from '@/components/ui/badge'
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
import type { AgentPreflightReceiptSummary } from '@/lib/agent-preflight/contracts'

type Project = {
  id: string
  kind: 'LOCAL_WORKSPACE' | 'REMOTE_BLACK_BOX'
  displayName: string
  description: string | null
  canonicalIdentity: string
  canonicalPath: string | null
  normalizedRemoteOrigin: string | null
  lastDetectedAt: Date
  preflight?: AgentPreflightReceiptSummary
}

function projectIdentityLabel(
  project: Pick<Project, 'canonicalPath' | 'normalizedRemoteOrigin' | 'canonicalIdentity'>,
) {
  return project.canonicalPath ?? project.normalizedRemoteOrigin ?? project.canonicalIdentity
}

const projectDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export default function ProjectManagement({
  projects,
  highlightedPreflightId,
}: {
  projects: Project[]
  highlightedPreflightId?: string
}) {
  const [query, setQuery] = useState('')
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return projects
    return projects.filter(project =>
      [project.displayName, project.description ?? '', projectIdentityLabel(project)].some(value =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    )
  }, [projects, query])

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Registered projects</CardTitle>
          <CardDescription>
            Search, select, rename, or permanently remove registered local and remote targets.
          </CardDescription>
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
            <p className="text-sm text-muted-foreground">Register a local workspace or remote target to begin.</p>
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
                <TableHead>Target identity</TableHead>
                <TableHead>Last detected</TableHead>
                <TableHead>Agent readiness</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProjects.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  highlightPreflight={project.preflight?.id === highlightedPreflightId}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ProjectRow({ project, highlightPreflight }: { project: Project; highlightPreflight: boolean }) {
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
      <TableCell className="max-w-md truncate font-mono text-xs" title={projectIdentityLabel(project)}>
        {projectIdentityLabel(project)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {projectDateFormatter.format(new Date(project.lastDetectedAt))}
      </TableCell>
      <TableCell>
        <AgentPreflightDialog receipt={project.preflight} initiallyOpen={highlightPreflight} />
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

const preflightLayerLabels = {
  applicationAndIdentity: 'Application and identity',
  activeMcpTransport: 'Active MCP transport',
  currentTaskCapabilities: 'Current task capabilities',
  targetProjectBinding: 'Target project binding',
} as const

type PreflightLayerStatus<T> = T extends { status: infer Status } ? Status : never
type AgentPreflightLayerStatus = PreflightLayerStatus<
  Exclude<
    AgentPreflightReceiptSummary['preflight']['layers'][keyof AgentPreflightReceiptSummary['preflight']['layers']],
    undefined
  >
>

function PreflightStatus({ status }: { status: AgentPreflightLayerStatus }) {
  if (status === 'ready')
    return (
      <Badge className="gap-1 border-emerald-500/35 bg-emerald-500/10 text-emerald-200" variant="outline">
        <CircleCheck aria-hidden="true" className="size-3.5" /> Ready
      </Badge>
    )
  if (status === 'blocked')
    return (
      <Badge className="gap-1 border-red-500/35 bg-red-500/10 text-red-200" variant="outline">
        <CircleX aria-hidden="true" className="size-3.5" /> Blocked
      </Badge>
    )
  return (
    <Badge className="gap-1" variant="outline">
      <CircleHelp aria-hidden="true" className="size-3.5" />
      {status === 'unverified' ? 'Unverified' : 'Not applicable'}
    </Badge>
  )
}

function AgentPreflightDialog({
  receipt,
  initiallyOpen,
}: {
  receipt?: AgentPreflightReceiptSummary
  initiallyOpen: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  if (!receipt)
    return (
      <Badge className="gap-1" variant="outline">
        <CircleHelp aria-hidden="true" className="size-3.5" /> Not observed
      </Badge>
    )

  const capabilityLayer = receipt.preflight.layers.currentTaskCapabilities
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="h-auto p-0" variant="ghost" onClick={() => setOpen(true)}>
        <PreflightStatus
          status={receipt.preflight.status === 'needs_observation' ? 'unverified' : receipt.preflight.status}
        />
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agent preflight receipt</DialogTitle>
          <DialogDescription>
            Durable evidence recorded by project_diagnostic at {new Date(receipt.observedAt).toLocaleString()}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {Object.entries(receipt.preflight.layers).map(([key, layer]) => (
            <div
              className="flex items-start justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              key={key}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{preflightLayerLabels[key as keyof typeof preflightLayerLabels]}</p>
                {'message' in layer ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{layer.message}</p>
                ) : null}
              </div>
              <PreflightStatus status={layer.status} />
            </div>
          ))}
        </div>
        {capabilityLayer.tools.missing.length || capabilityLayer.resources.missing.length ? (
          <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs">
            <p className="font-medium text-red-200">Missing from the current task snapshot</p>
            {capabilityLayer.tools.missing.length ? (
              <p className="mt-2 break-words text-muted-foreground">
                Tools: {capabilityLayer.tools.missing.join(', ')}
              </p>
            ) : null}
            {capabilityLayer.resources.missing.length ? (
              <p className="mt-1 break-words text-muted-foreground">
                Resources: {capabilityLayer.resources.missing.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1 font-mono text-[11px] text-muted-foreground">
          <p>Receipt: {receipt.snapshotHash}</p>
          <p>MCP surface: {receipt.mcpSurfaceVersion}</p>
          <p>Server started: {new Date(receipt.mcpServerStartedAt).toLocaleString()}</p>
        </div>
      </DialogContent>
    </Dialog>
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
            Only project metadata changes. The canonical target identity, project ID, and ownership history stay
            unchanged.
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
