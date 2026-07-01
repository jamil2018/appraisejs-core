'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type {
  PlanProjection,
  ProviderAdapterRegistration,
  ProviderArtifactSnapshot,
  ProviderPermissionDecision,
  ProviderRunEvent,
  ProviderWorkflowRun,
  TargetProject,
} from '@prisma/client'
import {
  Ban,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  MapPinned,
  PackageCheck,
  Play,
  Settings2,
  ShieldCheck,
} from 'lucide-react'

import {
  cancelProviderRunAction,
  createProviderRunAction,
  decideProviderPermissionAction,
  registerProviderTargetProjectAction,
} from '@/actions/provider-runs/provider-run-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type RunWithRelations = ProviderWorkflowRun & {
  plan: PlanProjection | null
  targetProject: TargetProject
  providerAdapter: ProviderAdapterRegistration | null
  events: ProviderRunEvent[]
  permissionDecisions: ProviderPermissionDecision[]
  artifactSnapshots: ProviderArtifactSnapshot[]
}

type ProviderRunWorkspaceProps = {
  runs: RunWithRelations[]
  adapters: ProviderAdapterRegistration[]
  targetProjects: TargetProject[]
  plans: Array<PlanProjection & { tasks: unknown[]; issues: unknown[] }>
}

const TARGET_PROJECT_NONE_VALUE = 'none'
const TARGET_TAB_EXISTING_VALUE = 'existing'
const TARGET_TAB_REGISTER_VALUE = 'register'

type TargetProjectFile = File & {
  path?: string
}

const statusStyles: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  queued: { label: 'Queued', className: 'border-sky-500/50 text-sky-300', icon: <Clock3 className="size-3" /> },
  running: { label: 'Running', className: 'border-emerald-500/50 text-emerald-300', icon: <Play className="size-3" /> },
  completed: {
    label: 'Completed',
    className: 'border-green-500/50 text-green-300',
    icon: <CheckCircle2 className="size-3" />,
  },
  cancelled: { label: 'Cancelled', className: 'border-zinc-500/50 text-zinc-300', icon: <Ban className="size-3" /> },
  failed: { label: 'Failed', className: 'border-red-500/50 text-red-300', icon: <CircleAlert className="size-3" /> },
  paused: { label: 'Paused', className: 'border-yellow-500/50 text-yellow-300', icon: <Clock3 className="size-3" /> },
  recovery_required: {
    label: 'Recovery',
    className: 'border-amber-500/50 text-amber-300',
    icon: <CircleAlert className="size-3" />,
  },
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? statusStyles.queued
  return (
    <Badge variant="outline" className={`gap-1 ${style.className}`}>
      {style.icon}
      {style.label}
    </Badge>
  )
}

function formatDate(value: Date | string | null) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString()
}

function parsePayload(payloadJson: string | null) {
  if (!payloadJson) return null
  try {
    return JSON.parse(payloadJson) as unknown
  } catch {
    return payloadJson
  }
}

function EventPayload({ value }: { value: unknown }) {
  if (!value) return null
  return (
    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-zinc-950 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function RunCard({ run, active, onSelect }: { run: RunWithRelations; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`hover:border-primary/60 w-full rounded-lg border p-4 text-left transition ${
        active ? 'border-primary/80 bg-primary/10' : 'border-zinc-800 bg-zinc-950/40'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{run.targetProject.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{run.launchPrompt}</p>
        </div>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{run.providerAdapter?.displayName ?? run.providerKind}</span>
        <span>{formatDate(run.createdAt)}</span>
      </div>
    </button>
  )
}

function getDirectoryPathFromFiles(files: FileList | null) {
  const firstFile = files?.[0] as TargetProjectFile | undefined
  if (!firstFile?.path) return ''
  const relativePath = firstFile.webkitRelativePath
  if (!relativePath) return firstFile.path
  const selectedDirectoryName = relativePath.split(/[\\/]/)[0] ?? ''
  const filePathWithinDirectory = relativePath.slice(selectedDirectoryName.length).replace(/^[\\/]/, '')
  if (!filePathWithinDirectory) return firstFile.path
  return firstFile.path.slice(0, -filePathWithinDirectory.length).replace(/[\\/]$/, '')
}

// fallow-ignore-next-line complexity
export function ProviderRunWorkspace({ runs, adapters, targetProjects, plans }: ProviderRunWorkspaceProps) {
  const router = useRouter()
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id ?? '')
  const [targetTab, setTargetTab] = useState(
    targetProjects.length > 0 ? TARGET_TAB_EXISTING_VALUE : TARGET_TAB_REGISTER_VALUE,
  )
  const [targetProjectId, setTargetProjectId] = useState(TARGET_PROJECT_NONE_VALUE)
  const [planId, setPlanId] = useState('none')
  const [providerKey, setProviderKey] = useState(adapters[0]?.key ?? '')
  const [providerProfile, setProviderProfile] = useState(adapters[0]?.defaultProfile ?? 'planning-default')
  const [launchPrompt, setLaunchPrompt] = useState('')
  const [newTargetPath, setNewTargetPath] = useState('')
  const [newTargetName, setNewTargetName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedRun = useMemo(
    () => runs.find(run => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  )

  function launchRun() {
    setMessage(null)
    const selectedTargetProjectId = targetProjectId === TARGET_PROJECT_NONE_VALUE ? '' : targetProjectId
    if (!selectedTargetProjectId) {
      setMessage('Select a target project before launching a run.')
      return
    }
    // fallow-ignore-next-line complexity
    startTransition(async () => {
      const response = await createProviderRunAction({
        targetProjectId: selectedTargetProjectId,
        planId: planId === 'none' ? undefined : planId,
        providerKey,
        providerProfile,
        launchPrompt,
      })
      if (!response.success) {
        setMessage(response.error ?? 'Provider run launch failed.')
        return
      }
      const runId = (response.data as { runId?: string } | undefined)?.runId
      if (runId) setSelectedRunId(runId)
      setLaunchPrompt('')
      router.refresh()
    })
  }

  function registerTargetProject() {
    setMessage(null)
    startTransition(async () => {
      const response = await registerProviderTargetProjectAction({
        projectPath: newTargetPath,
        displayName: newTargetName || undefined,
      })
      if (!response.success) {
        setMessage(response.error ?? 'Target project registration failed.')
        return
      }
      const targetProjectId = (response.data as { targetProjectId?: string } | undefined)?.targetProjectId
      if (targetProjectId) setTargetProjectId(targetProjectId)
      setTargetTab(TARGET_TAB_EXISTING_VALUE)
      setNewTargetPath('')
      setNewTargetName('')
      router.refresh()
    })
  }

  function handleTargetDirectoryChange(files: FileList | null) {
    setMessage(null)
    const directoryPath = getDirectoryPathFromFiles(files)
    if (!directoryPath) {
      setNewTargetPath('')
      setMessage('The browser did not expose a local folder path. Choose from an environment that allows path access.')
      return
    }
    setNewTargetPath(directoryPath)
  }

  function cancelRun(runId: string) {
    setMessage(null)
    startTransition(async () => {
      const response = await cancelProviderRunAction({ runId })
      if (!response.success) setMessage(response.error ?? 'Provider run cancellation failed.')
      router.refresh()
    })
  }

  function decidePermission(run: RunWithRelations, event: ProviderRunEvent, decision: 'approved' | 'denied') {
    const payload = parsePayload(event.payloadJson) as Record<string, unknown> | null
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : event.id
    // fallow-ignore-next-line complexity
    startTransition(async () => {
      const response = await decideProviderPermissionAction({
        runId: run.id,
        requestId,
        decision,
        riskTier: typeof payload?.riskTier === 'string' ? payload.riskTier : 'unknown',
        requestedScope: typeof payload?.requestedScope === 'string' ? payload.requestedScope : 'unknown',
        payload: payload ?? {},
      })
      if (!response.success) setMessage(response.error ?? 'Permission decision failed.')
      router.refresh()
    })
  }

  const selectedTargetProjectId = targetProjectId === TARGET_PROJECT_NONE_VALUE ? '' : targetProjectId
  const canLaunch =
    Boolean(selectedTargetProjectId && providerKey && launchPrompt.trim() && adapters.length > 0) && !isPending

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]" aria-label="Provider run workspace">
      <div className="space-y-6">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" />
              Launch Run
            </CardTitle>
            <CardDescription>Planning-only runs can inspect targets and prepare review work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {adapters.length === 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="text-amber-200">No coding agent provider is enabled and launchable.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/settings">
                    <Settings2 className="size-4" />
                    Open Settings
                  </Link>
                </Button>
              </div>
            ) : null}
            <Tabs value={targetTab} onValueChange={setTargetTab} className="space-y-3">
              <div className="rounded-lg border border-zinc-800 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(245,158,11,0.08)_48%,rgba(39,39,42,0.28))] p-1.5">
                <TabsList className="grid h-auto w-full grid-cols-2 rounded-md bg-zinc-950/70 p-1">
                  <TabsTrigger value={TARGET_TAB_EXISTING_VALUE} className="gap-2 py-2">
                    <PackageCheck className="size-4" />
                    Existing
                  </TabsTrigger>
                  <TabsTrigger value={TARGET_TAB_REGISTER_VALUE} className="gap-2 py-2">
                    <FolderPlus className="size-4" />
                    Register new
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={TARGET_TAB_EXISTING_VALUE} className="m-0">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="mt-0.5 rounded-md border border-sky-400/30 bg-sky-400/10 p-2 text-sky-200">
                      <MapPinned className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="target-project">Target Project</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pick the workspace this provider run can inspect.
                      </p>
                    </div>
                  </div>
                  <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                    <SelectTrigger id="target-project">
                      <SelectValue placeholder="Select a target project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TARGET_PROJECT_NONE_VALUE}>No target selected</SelectItem>
                      {targetProjects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value={TARGET_TAB_REGISTER_VALUE} className="m-0">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="mt-0.5 rounded-md border border-amber-400/30 bg-amber-400/10 p-2 text-amber-200">
                      <GitBranch className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Register Target</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Choose the local project folder Appraise should track.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="target-folder-picker">Project Folder</Label>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          id="target-folder-display"
                          aria-label="Selected project path"
                          value={newTargetPath}
                          readOnly
                          placeholder="Choose a folder"
                          className="font-mono text-xs"
                        />
                        <Label
                          htmlFor="target-folder-picker"
                          className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <FolderOpen className="size-4" />
                          Browse
                        </Label>
                        <input
                          id="target-folder-picker"
                          aria-label="Project folder chooser"
                          type="file"
                          className="sr-only"
                          onChange={event => handleTargetDirectoryChange(event.currentTarget.files)}
                          {...({ directory: '', webkitdirectory: '' } as Record<string, string>)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-target-name">Display Name</Label>
                      <Input
                        id="new-target-name"
                        value={newTargetName}
                        onChange={event => setNewTargetName(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={registerTargetProject}
                      disabled={!newTargetPath.trim() || isPending}
                      className="w-fit"
                    >
                      <FolderPlus className="size-4" />
                      Add Target
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="plan">Plan Context</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger id="plan">
                  <SelectValue placeholder="Optional plan context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No existing plan</SelectItem>
                  {plans.map(plan => (
                    <SelectItem key={plan.planId} value={plan.planId}>
                      {plan.goal}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={providerKey}
                  onValueChange={value => {
                    setProviderKey(value)
                    const adapter = adapters.find(candidate => candidate.key === value)
                    setProviderProfile(adapter?.defaultProfile ?? 'planning-default')
                  }}
                >
                  <SelectTrigger id="provider">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {adapters.map(adapter => (
                      <SelectItem key={adapter.key} value={adapter.key}>
                        {adapter.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile">Profile</Label>
                <Input
                  id="profile"
                  value={providerProfile}
                  onChange={event => setProviderProfile(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Brief</Label>
              <Textarea
                id="prompt"
                value={launchPrompt}
                onChange={event => setLaunchPrompt(event.target.value)}
                rows={5}
                placeholder="Ask the provider to draft or revise a plan. Appraise remains the lifecycle authority."
              />
            </div>

            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            <Button type="button" onClick={launchRun} disabled={!canLaunch} className="w-full">
              <Play className="size-4" />
              Launch Planning Run
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {runs.length === 0 ? (
            <Card className="rounded-lg">
              <CardContent className="p-6 text-sm text-muted-foreground">No provider runs recorded yet.</CardContent>
            </Card>
          ) : (
            runs.map(run => (
              <RunCard
                key={run.id}
                run={run}
                active={selectedRun?.id === run.id}
                onSelect={() => setSelectedRunId(run.id)}
              />
            ))
          )}
        </div>
      </div>

      <Card className="rounded-lg">
        {selectedRun ? (
          <>
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div>
                <CardTitle className="text-lg">{selectedRun.targetProject.displayName}</CardTitle>
                <CardDescription>{selectedRun.targetProject.canonicalPath}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selectedRun.status} />
                {selectedRun.plan ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/plans/${selectedRun.plan.planId}`}>
                      <ExternalLink className="size-4" />
                      Open Plan
                    </Link>
                  </Button>
                ) : null}
                {!['completed', 'failed', 'cancelled'].includes(selectedRun.status) ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => cancelRun(selectedRun.id)}
                    disabled={isPending}
                  >
                    <Ban className="size-4" />
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-zinc-800 p-3">
                  <p className="text-xs text-muted-foreground">Launch Lifecycle Phase</p>
                  <p className="mt-1 text-sm font-medium">{selectedRun.lifecyclePhase}</p>
                </div>
                <div className="rounded-md border border-zinc-800 p-3">
                  <p className="text-xs text-muted-foreground">Provider</p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedRun.providerAdapter?.displayName ?? selectedRun.providerKind}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-800 p-3">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedRun.completedAt)}</p>
                </div>
              </div>

              <section className="space-y-3" aria-label="Provider events">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4" />
                  Event Stream
                </h2>
                <div className="space-y-3">
                  {selectedRun.events.map(event => {
                    const payload = parsePayload(event.payloadJson)
                    const isPermission = event.type === 'provider_permission_requested'
                    return (
                      <div key={event.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline">
                            {event.sequence}. {event.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                        </div>
                        {event.stream ? <p className="mt-3 text-sm">{event.stream}</p> : null}
                        <EventPayload value={payload} />
                        {isPermission ? (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decidePermission(selectedRun, event, 'approved')}
                            >
                              <ShieldCheck className="size-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => decidePermission(selectedRun, event, 'denied')}
                            >
                              <Ban className="size-4" />
                              Deny
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-zinc-800 p-4">
                  <h2 className="text-sm font-semibold">Permission Decisions</h2>
                  <div className="mt-3 space-y-2">
                    {selectedRun.permissionDecisions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No decisions recorded.</p>
                    ) : (
                      selectedRun.permissionDecisions.map(decision => (
                        <div key={decision.id} className="rounded-md bg-zinc-950 p-3 text-sm">
                          <div className="flex justify-between gap-3">
                            <span>{decision.requestedScope}</span>
                            <Badge variant={decision.decision === 'approved' ? 'default' : 'destructive'}>
                              {decision.decision}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(decision.decidedAt)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-zinc-800 p-4">
                  <h2 className="text-sm font-semibold">Artifacts</h2>
                  <div className="mt-3 space-y-2">
                    {selectedRun.artifactSnapshots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No artifact snapshots recorded.</p>
                    ) : (
                      selectedRun.artifactSnapshots.map(artifact => (
                        <div key={artifact.id} className="rounded-md bg-zinc-950 p-3 text-sm">
                          <p>{artifact.path}</p>
                          <p className="text-xs text-muted-foreground">{artifact.kind}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </CardContent>
          </>
        ) : (
          <CardContent className="p-6 text-sm text-muted-foreground">Launch a run to inspect the console.</CardContent>
        )}
      </Card>
    </section>
  )
}
