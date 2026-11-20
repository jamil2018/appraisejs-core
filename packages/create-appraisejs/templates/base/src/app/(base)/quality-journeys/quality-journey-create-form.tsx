'use client'

import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { DraftSnapshot, EnvironmentOption } from './quality-journey-create-form-shared'
import { useQualityJourneyCreateIntake } from './use-quality-journey-create-intake'

const glassPanelClassName = 'rounded-xl border bg-card/40'
const liquidGlassButtonClassName = 'rounded-full'

function IntakeHeader({
  predecessorJourneyId,
  saveConflict,
  saveStatus,
  onRetry,
  onSaveAsNewDraft,
}: {
  predecessorJourneyId?: string
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
          ? 'Unsaved changes—saving shortly.'
          : saveStatus === 'failed'
            ? 'Couldn’t save—Retry.'
            : 'Your brief will be saved to this workspace after your first edit.'
  return (
    <header className={`${glassPanelClassName} relative overflow-hidden rounded-xl px-5 py-6 sm:px-7`}>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_68%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
      />
      <div className="relative">
        <h2 className="text-lg font-semibold tracking-tight">Start a Quality Journey</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Describe what you want to validate. Appraise will analyze your brief and ask for any missing details.
          {predecessorJourneyId ? ` This Journey follows ${predecessorJourneyId}.` : null}
        </p>
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {message}
        </p>
        {saveConflict ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className={liquidGlassButtonClassName}
              onClick={() => window.location.reload()}
              size="sm"
              type="button"
              variant="outline"
            >
              Load saved version
            </Button>
            <Button
              className={liquidGlassButtonClassName}
              onClick={onSaveAsNewDraft}
              size="sm"
              type="button"
              variant="outline"
            >
              Save my edits as a new draft
            </Button>
          </div>
        ) : null}
        {saveStatus === 'failed' ? (
          <Button
            className={`${liquidGlassButtonClassName} mt-3`}
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry save
          </Button>
        ) : null}
      </div>
    </header>
  )
}

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
  draft,
}: {
  projectId: string
  predecessorJourneyId?: string
  initialEnvironments: EnvironmentOption[]
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
      <section className="bg-card/40 rounded-xl border p-6">
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
    <div className="mx-auto max-w-3xl space-y-5">
      <IntakeHeader
        onRetry={() => void actions.enqueueSave()}
        onSaveAsNewDraft={actions.saveAsNewDraft}
        predecessorJourneyId={predecessorJourneyId}
        saveConflict={saveConflict}
        saveStatus={saveStatus}
      />
      <form
        className={`${glassPanelClassName} space-y-5 p-5 sm:p-7`}
        onSubmit={event => {
          event.preventDefault()
          actions.submit()
        }}
      >
        <div className="space-y-3">
          <Label htmlFor="quality-journey-objective">What do you want to validate?</Label>
          <Textarea
            aria-describedby="quality-journey-brief-help"
            disabled={isPending}
            id="quality-journey-objective"
            maxLength={8000}
            onChange={event => update({ objective: event.target.value, error: null })}
            placeholder="For example: Check that a shopper can place an order, including payment failures and returning to checkout."
            rows={9}
            value={state.objective}
          />
          <p className="text-xs leading-5 text-muted-foreground" id="quality-journey-brief-help">
            Include any goals, behavior, risks, or context that matter. Your brief is saved as you type.
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
        <div className="flex justify-end">
          <Button disabled={isPending || saveConflict || !requirement.objective} type="submit">
            {isPending ? 'Starting…' : 'Start journey'}
            <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
