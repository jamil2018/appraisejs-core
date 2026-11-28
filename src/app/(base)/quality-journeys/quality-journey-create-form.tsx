'use client'

import { ArrowLeft, ArrowUp, Check, Paperclip } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  defaultManagedWorkerModel,
  managedWorkerEfforts,
  managedWorkerOptions,
  type ManagedWorkerEffort,
  type ManagedWorkerModel,
} from '@/lib/quality-journey/managed-worker-preferences'
import {
  getBriefRecordContext,
  journeyRecordLabels,
  withBriefFileContext,
  withoutBriefFileContext,
  type JourneyRecordContext,
} from '@/lib/quality-journey/record-context'
import type { ManagedJourneyProviderReadiness } from '@/services/coordinator/app-managed-journey-readiness'

import type { DraftSnapshot } from './quality-journey-create-form-shared'
import { useQualityJourneyCreateIntake } from './use-quality-journey-create-intake'

async function readBriefFile(file: File) {
  if (!/\.(txt|md|json)$/i.test(file.name)) throw new Error('Choose a .txt, .md, or .json file.')
  if (!file.size || file.size > 6_000 || file.name.length > 128)
    throw new Error('Choose a text file under 6 KB with a short name.')
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('The selected file could not be read.'))
    reader.onabort = () => reject(new Error('The selected file could not be read.'))
    reader.readAsText(file, 'utf-8')
  })
  if (!content.trim() || content.length > 6_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content))
    throw new Error('Choose a readable text file under 6 KB.')
  return { name: file.name, content }
}

function DraftSaveStatus({
  saveConflict,
  saveStatus,
  onRetry,
  onSaveAsNewDraft,
}: {
  saveConflict: boolean
  saveStatus: 'idle' | 'dirty' | 'saving' | 'saved' | 'failed'
  onRetry: () => void
  onSaveAsNewDraft: () => void
}) {
  const message =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved to this workspace'
        : saveStatus === 'dirty'
          ? 'Saving shortly…'
          : saveStatus === 'failed'
            ? saveConflict
              ? 'A newer version was saved.'
              : 'Couldn’t save your brief.'
            : 'Autosaves after your first edit.'
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground" role="status">
        {saveStatus === 'saved' ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        {message}
      </p>
      {saveConflict ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()} size="sm" type="button" variant="outline">
            Load saved version
          </Button>
          <Button onClick={onSaveAsNewDraft} size="sm" type="button" variant="outline">
            Save my edits as a new draft
          </Button>
        </div>
      ) : saveStatus === 'failed' ? (
        <Button className="mt-3" onClick={onRetry} size="sm" type="button" variant="outline">
          Retry save
        </Button>
      ) : null}
    </div>
  )
}

function BriefContext({ draft, recordContext }: { draft?: DraftSnapshot; recordContext?: JourneyRecordContext }) {
  const attachment = recordContext ?? getBriefRecordContext(draft?.requirement.context)
  if (attachment) {
    return (
      <p className="mx-1 flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-sm">
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-muted-foreground">{journeyRecordLabels[attachment.kind]}</span>
        <span className="min-w-0 truncate" title={attachment.title}>
          {attachment.title}
        </span>
      </p>
    )
  }
  if (!draft) return null
  const hasOtherDetails = Object.keys(draft.requirement).some(
    key => key !== 'objective' && key !== 'schemaVersion' && key !== 'context',
  )
  if (!withoutBriefFileContext(draft.requirement.context) && !hasOtherDetails) return null
  return <p className="px-2 text-xs text-muted-foreground">Details from your saved brief are retained.</p>
}

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
  preferredProvider,
  draft,
  recordContext,
  providerReadiness,
}: {
  projectId: string
  predecessorJourneyId?: string
  preferredProvider?: 'CODEX' | 'CLAUDE_CODE'
  draft?: DraftSnapshot
  recordContext?: JourneyRecordContext
  providerReadiness?: Record<'CODEX' | 'CLAUDE_CODE', ManagedJourneyProviderReadiness>
}) {
  const { push } = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [readingFile, setReadingFile] = useState(false)
  const { actions, isPending, requirement, saveConflict, saveStatus, state, update, updateView } =
    useQualityJourneyCreateIntake({
      draft,
      predecessorJourneyId,
      preferredProvider,
      projectId,
      push,
      recordContext,
    })
  const selectedReadiness = providerReadiness?.[state.managedWorkerProvider]
  if (draft?.status === 'ARCHIVED')
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">This draft is archived</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Restore it to continue editing. Archived drafts are never deleted automatically.
        </p>
        <Button className="mt-4" disabled={isPending} onClick={actions.restore} type="button">
          Restore draft
        </Button>
      </section>
    )
  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:pt-12">
      <header className="space-y-2">
        <Link
          className="app-focus inline-flex min-h-8 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
          href={`/quality-journeys?project=${encodeURIComponent(projectId)}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Quality Journeys
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {draft ? 'Continue your Journey brief' : 'What would you like to check?'}
        </h1>
        {!draft ? (
          <p className="text-sm text-muted-foreground">
            Describe what should happen. Appraise will suggest tests for you to review.
          </p>
        ) : null}
        {predecessorJourneyId ? (
          <p className="text-sm text-muted-foreground">
            Follow-up to{' '}
            <Link
              className="app-focus rounded-sm font-medium text-foreground underline underline-offset-4"
              href={`/quality-journeys/${encodeURIComponent(predecessorJourneyId)}?project=${encodeURIComponent(projectId)}`}
            >
              the previous Journey
            </Link>
          </p>
        ) : null}
      </header>
      <form
        className="space-y-2 rounded-[1.125rem] border border-border bg-popover p-2 focus-within:border-input"
        onSubmit={event => {
          event.preventDefault()
          actions.submit()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="quality-journey-objective" className="sr-only">
            What do you want to validate?
          </Label>
          <Textarea
            aria-describedby="quality-journey-brief-help"
            className="min-h-20 resize-y border-transparent bg-transparent px-2 py-1.5 text-base shadow-none"
            disabled={isPending}
            id="quality-journey-objective"
            maxLength={8000}
            onChange={event => update({ objective: event.target.value, error: null })}
            placeholder="For example: Check that a shopper can place an order, including payment failures and returning to checkout."
            rows={3}
            value={state.objective}
          />
          <p className="sr-only" id="quality-journey-brief-help">
            Include the expected behavior and any risks or constraints that matter.
          </p>
          <BriefContext draft={draft} recordContext={recordContext} />
          {state.attachedFile ? (
            <div className="mx-1 flex max-w-full items-center gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2 py-1">
                <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate" title={state.attachedFile.name}>
                  {state.attachedFile.name}
                </span>
              </span>
              <Button
                disabled={isPending}
                onClick={() => update({ attachedFile: null, error: null })}
                size="sm"
                type="button"
                variant="ghost"
              >
                Remove file
              </Button>
            </div>
          ) : null}
        </div>
        <input
          accept=".txt,.md,.json,text/plain,text/markdown,application/json"
          aria-hidden="true"
          aria-label="Text file"
          className="sr-only"
          disabled={isPending}
          id="quality-journey-file"
          onChange={async event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setReadingFile(true)
            try {
              const attachment = await readBriefFile(file)
              const sourceContext =
                draft?.requirement.context ?? (recordContext ? JSON.stringify(recordContext) : undefined)
              withBriefFileContext(withoutBriefFileContext(sourceContext), attachment)
              update({ attachedFile: attachment, error: null })
            } catch (error) {
              updateView({ error: error instanceof Error ? error.message : 'Unable to attach this file.' })
            } finally {
              setReadingFile(false)
            }
          }}
          ref={fileInput}
          tabIndex={-1}
          type="file"
        />
        <div className="grid gap-2 px-2 pb-1 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="quality-journey-provider" className="text-xs text-muted-foreground">
              Provider
            </Label>
            <select
              className="app-focus block min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              disabled={isPending}
              id="quality-journey-provider"
              onChange={event =>
                update({
                  managedWorkerProvider: event.target.value as 'CODEX' | 'CLAUDE_CODE',
                  managedWorkerModel: null,
                  error: null,
                })
              }
              value={state.managedWorkerProvider}
            >
              <option value="CODEX">Codex</option>
              <option value="CLAUDE_CODE">Claude Code</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quality-journey-model" className="text-xs text-muted-foreground">
              Model
            </Label>
            <select
              className="app-focus block min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              disabled={isPending}
              id="quality-journey-model"
              onChange={event =>
                update({
                  managedWorkerModel:
                    event.target.value === 'default' ? null : (event.target.value as ManagedWorkerModel),
                  error: null,
                })
              }
              value={state.managedWorkerModel ?? 'default'}
            >
              <option value="default">
                {defaultManagedWorkerModel[state.managedWorkerProvider]
                  ? `Default (${defaultManagedWorkerModel[state.managedWorkerProvider]})`
                  : 'Provider default'}
              </option>
              {managedWorkerOptions[state.managedWorkerProvider].map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quality-journey-effort" className="text-xs text-muted-foreground">
              Effort
            </Label>
            <select
              className="app-focus block min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              disabled={isPending}
              id="quality-journey-effort"
              onChange={event =>
                update({
                  managedWorkerEffort:
                    event.target.value === 'default' ? null : (event.target.value as ManagedWorkerEffort),
                  error: null,
                })
              }
              value={state.managedWorkerEffort ?? 'default'}
            >
              <option value="default">Default</option>
              {managedWorkerEfforts.map(effort => (
                <option key={effort} value={effort}>
                  {effort.charAt(0).toUpperCase() + effort.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedReadiness && !selectedReadiness.ready ? (
          <p className="flex flex-wrap items-center gap-x-2 px-2 text-xs text-warning" role="status">
            {selectedReadiness.reason}
            {selectedReadiness.actionLabel ? (
              <Link
                aria-disabled={isPending || readingFile || saveConflict}
                className="app-focus font-medium underline underline-offset-2"
                href={selectedReadiness.settingsHref}
                onNavigate={event => {
                  event.preventDefault()
                  if (!isPending && !readingFile && !saveConflict)
                    actions.openProviderSetup(selectedReadiness.settingsHref)
                }}
              >
                {selectedReadiness.actionLabel}
              </Link>
            ) : null}
          </p>
        ) : null}
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <Button
            aria-label="Attach a text file"
            disabled={isPending}
            onClick={() => fileInput.current?.click()}
            size="sm"
            title="Attach a text file (.txt, .md, or .json, up to 6 KB)"
            type="button"
            variant="ghost"
          >
            <Paperclip aria-hidden="true" className="size-4" />
            Attach file
          </Button>
          <DraftSaveStatus
            onRetry={() => void actions.enqueueSave()}
            onSaveAsNewDraft={actions.saveAsNewDraft}
            saveConflict={saveConflict}
            saveStatus={saveStatus}
          />
          <Button
            className="ml-auto rounded-full"
            disabled={
              isPending ||
              readingFile ||
              saveConflict ||
              !requirement.objective ||
              Boolean(selectedReadiness && !selectedReadiness.ready)
            }
            size="sm"
            type="submit"
          >
            {isPending ? 'Starting…' : 'Start journey'}
            <ArrowUp aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
