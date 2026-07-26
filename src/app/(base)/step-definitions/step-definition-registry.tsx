'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, MoreHorizontal, PencilLine, Trash2 } from 'lucide-react'

import {
  createStepDefinitionVersionDraftAction,
  deleteStepDefinitionDraftAction,
  deprecateStepDefinitionAction,
} from '@/actions/step-definition/step-definition-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'
import type { StepDefinitionDraftSummary, StepDefinitionOption } from '@/types/step-definition-option'

type DialogState =
  | { kind: 'version'; definition: StepDefinitionOption }
  | { kind: 'deprecate'; definition: StepDefinitionOption }
  | { kind: 'delete-draft'; draft: StepDefinitionDraftSummary }
  | null

function actionError(response: ActionResponse) {
  return response.error ?? response.message ?? 'The Step Definition request failed.'
}

function suggestedNextVersion(version: string) {
  const segments = version.split('.')
  const last = Number(segments.at(-1))
  if (!Number.isInteger(last)) return ''
  return [...segments.slice(0, -1), String(last + 1)].join('.')
}

function DraftCard({
  draft,
  onDelete,
  onResume,
}: {
  draft: StepDefinitionDraftSummary
  onDelete: () => void
  onResume: () => void
}) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.025] shadow-none">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{draft.title}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {draft.proposedStepId}@{draft.proposedVersion} · revision {draft.revision}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
            <Clock3 aria-hidden="true" className="size-3.5" />
            Updated <time dateTime={draft.updatedAt}>{draft.updatedAt.replace('T', ' ').replace('.000Z', ' UTC')}</time>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={onResume}>
            <PencilLine aria-hidden="true" />
            Resume
          </Button>
          <Button
            aria-label={`Delete draft ${draft.title}`}
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReadyDefinitionCard({
  definition,
  onDeprecate,
  onVersion,
}: {
  definition: StepDefinitionOption
  onDeprecate: () => void
  onVersion: () => void
}) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.025] shadow-none">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{definition.title}</CardTitle>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {definition.reference.id}@{definition.reference.version}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {definition.sourceOwned ? <Badge variant="outline">Source managed</Badge> : null}
            <Badge variant="secondary">{definition.groupId}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={`Manage ${definition.title}`} size="icon" variant="ghost" className="size-8">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={definition.sourceOwned} onSelect={onVersion}>
                  Create new version
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDeprecate}>
                  Deprecate version
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{definition.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <code className="block overflow-x-auto rounded-md border border-white/[0.07] bg-black/20 px-3 py-2 text-xs">
          {definition.signature}
        </code>
        <div className="flex flex-wrap gap-2">
          {definition.keywordCompatibility.map(keyword => (
            <Badge key={keyword} variant="outline">
              {keyword}
            </Badge>
          ))}
          <Badge variant="outline">
            {definition.inputs.length} input{definition.inputs.length === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

export function StepDefinitionRegistry({
  definitions,
  drafts,
}: {
  definitions: StepDefinitionOption[]
  drafts: StepDefinitionDraftSummary[]
}) {
  const { push, refresh } = useRouter()
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const filteredDefinitions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return definitions
    return definitions.filter(definition =>
      [
        definition.reference.id,
        definition.reference.version,
        definition.title,
        definition.description,
        definition.signature,
        definition.groupId,
      ].some(candidate => candidate.toLowerCase().includes(normalizedQuery)),
    )
  }, [definitions, query])

  const openVersionDialog = (definition: StepDefinitionOption) => {
    setValue(suggestedNextVersion(definition.reference.version))
    setDialog({ kind: 'version', definition })
  }
  const openDeprecationDialog = (definition: StepDefinitionOption) => {
    setValue('')
    setDialog({ kind: 'deprecate', definition })
  }
  const closeDialog = () => {
    if (!busy) setDialog(null)
  }
  const submitDialog = async () => {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.kind === 'version') {
        const response = await createStepDefinitionVersionDraftAction({
          stepId: dialog.definition.reference.id,
          version: dialog.definition.reference.version,
          newVersion: value,
        })
        if (!response.success) throw new Error(actionError(response))
        const draft = response.data as { id: string }
        toast({ title: 'Version draft created', description: `${value} is ready to edit.` })
        push(`/step-definitions/drafts/${draft.id}`)
        return
      }
      if (dialog.kind === 'deprecate') {
        const response = await deprecateStepDefinitionAction({
          stepId: dialog.definition.reference.id,
          version: dialog.definition.reference.version,
          reason: value,
        })
        if (!response.success) throw new Error(actionError(response))
        toast({
          title: 'Step Definition deprecated',
          description: `${dialog.definition.reference.id}@${dialog.definition.reference.version} remains resolvable for historical references.`,
        })
      } else {
        const response = await deleteStepDefinitionDraftAction({
          draftId: dialog.draft.id,
          expectedRevision: dialog.draft.revision,
        })
        if (!response.success) throw new Error(actionError(response))
        toast({ title: 'Draft deleted', description: `${dialog.draft.title} was removed.` })
      }
      setDialog(null)
      refresh()
    } catch (error) {
      toast({
        title: 'Step Definition not changed',
        description: error instanceof Error ? error.message : 'The request did not complete.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      {drafts.length ? (
        <section aria-labelledby="step-definition-drafts-heading" className="space-y-3">
          <div>
            <h2 id="step-definition-drafts-heading" className="text-sm font-semibold text-zinc-100">
              Your drafts
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Resume unfinished work or remove drafts you no longer need.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {drafts.map(draft => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onDelete={() => setDialog({ kind: 'delete-draft', draft })}
                onResume={() => push(`/step-definitions/drafts/${draft.id}`)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ready-step-definitions-heading" className="space-y-5">
        <div>
          <h2 id="ready-step-definitions-heading" className="text-sm font-semibold text-zinc-100">
            Published library
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Published versions are immutable. Create a new version to modify behavior.
          </p>
        </div>
        <div className="relative max-w-xl">
          <Input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by name, ID, signature, or group"
            aria-label="Search Step Definitions"
          />
        </div>
        <p className="text-sm text-muted-foreground" role="status">
          Showing {filteredDefinitions.length} of {definitions.length} ready Step Definitions
        </p>
        {filteredDefinitions.length === 0 ? (
          <Card className="bg-muted/20 border-dashed shadow-none">
            <CardContent className="py-10 text-center">
              <p className="font-medium">No Step Definitions match “{query.trim()}”.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a broader intent, group, or parameter name.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filteredDefinitions.map(definition => (
              <ReadyDefinitionCard
                key={`${definition.reference.id}@${definition.reference.version}`}
                definition={definition}
                onDeprecate={() => openDeprecationDialog(definition)}
                onVersion={() => openVersionDialog(definition)}
              />
            ))}
          </div>
        )}
      </section>

      <ManagementDialog
        busy={busy}
        dialog={dialog}
        onClose={closeDialog}
        onSubmit={submitDialog}
        onValueChange={setValue}
        value={value}
      />
    </div>
  )
}

function ManagementDialog({
  busy,
  dialog,
  onClose,
  onSubmit,
  onValueChange,
  value,
}: {
  busy: boolean
  dialog: DialogState
  onClose: () => void
  onSubmit: () => void
  onValueChange: (value: string) => void
  value: string
}) {
  if (!dialog) return null
  if (dialog.kind === 'version')
    return (
      <VersionDialog busy={busy} onClose={onClose} onSubmit={onSubmit} onValueChange={onValueChange} value={value} />
    )
  if (dialog.kind === 'deprecate')
    return (
      <DeprecationDialog
        busy={busy}
        onClose={onClose}
        onSubmit={onSubmit}
        onValueChange={onValueChange}
        value={value}
      />
    )
  return <DeleteDraftDialog busy={busy} onClose={onClose} onSubmit={onSubmit} />
}

type DialogActions = {
  busy: boolean
  onClose: () => void
  onSubmit: () => void
}

function VersionDialog({
  busy,
  onClose,
  onSubmit,
  onValueChange,
  value,
}: DialogActions & { onValueChange: (value: string) => void; value: string }) {
  return (
    <TextManagementDialog
      busy={busy}
      description="The published version remains unchanged. A resumable draft will be created from its current definition."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Create version draft"
      title="Create a new version"
      value={value}
    >
      <Label htmlFor="step-definition-version">New version</Label>
      <Input
        id="step-definition-version"
        placeholder="e.g. 2"
        value={value}
        onChange={event => onValueChange(event.target.value)}
      />
    </TextManagementDialog>
  )
}

function DeprecationDialog({
  busy,
  onClose,
  onSubmit,
  onValueChange,
  value,
}: DialogActions & { onValueChange: (value: string) => void; value: string }) {
  return (
    <TextManagementDialog
      busy={busy}
      description="Existing exact references will continue to resolve, but this version will leave default discovery."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Deprecate"
      title="Deprecate this version?"
      value={value}
      variant="destructive"
    >
      <Label htmlFor="step-definition-deprecation-reason">Reason</Label>
      <Textarea
        id="step-definition-deprecation-reason"
        placeholder="Explain why new test authors should stop choosing this version."
        value={value}
        onChange={event => onValueChange(event.target.value)}
      />
    </TextManagementDialog>
  )
}

function TextManagementDialog({
  busy,
  children,
  description,
  onClose,
  onSubmit,
  submitLabel,
  title,
  value,
  variant = 'default',
}: DialogActions & {
  children: ReactNode
  description: string
  submitLabel: string
  title: string
  value: string
  variant?: 'default' | 'destructive'
}) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">{children}</div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant={variant} disabled={busy || !value.trim()} onClick={onSubmit}>
            {busy ? 'Working…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDraftDialog({ busy, onClose, onSubmit }: DialogActions) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this draft?</DialogTitle>
          <DialogDescription>
            This removes the draft and its staged handler artifact. Published versions are not affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onSubmit}>
            {busy ? 'Working…' : 'Delete draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
