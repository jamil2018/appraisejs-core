'use client'

import { ArrowLeft, ArrowUp, Check } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { DraftSnapshot } from './quality-journey-create-form-shared'
import { useQualityJourneyCreateIntake } from './use-quality-journey-create-intake'

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

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
  draft,
}: {
  projectId: string
  predecessorJourneyId?: string
  draft?: DraftSnapshot
}) {
  const { push } = useRouter()
  const { actions, isPending, requirement, saveConflict, saveStatus, state, update } = useQualityJourneyCreateIntake({
    draft,
    predecessorJourneyId,
    projectId,
    push,
  })
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
          {draft && Object.keys(draft.requirement).some(key => key !== 'objective' && key !== 'schemaVersion') ? (
            <p className="text-xs text-muted-foreground">Details from your saved brief are retained.</p>
          ) : null}
        </div>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <DraftSaveStatus
            onRetry={() => void actions.enqueueSave()}
            onSaveAsNewDraft={actions.saveAsNewDraft}
            saveConflict={saveConflict}
            saveStatus={saveStatus}
          />
          <Button
            className="ml-auto rounded-full"
            disabled={isPending || saveConflict || !requirement.objective}
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
