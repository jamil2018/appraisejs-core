'use client'

import { Check, Clipboard, ExternalLink, LoaderCircle, TerminalSquare } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { codexHandoffGuidance } from '@/lib/quality-journey/presentation'

import {
  launchQualityJourneyHandoffAction,
  prepareQualityJourneyHandoffAction,
} from '../quality-journey-handoff-actions'

type HandoffView = {
  id: string
  providerId: string
  status: string
  expiresAt: Date
  launchedAt: Date | null
  connectedAt: Date | null
  failureCode: string | null
} | null

type HandoffState = {
  prompt: string | null
  handoffId: string | null
  status: string
  copied: boolean
}

function actionData(response: { success?: boolean; data?: unknown }) {
  return response.success && response.data && typeof response.data === 'object'
    ? (response.data as Record<string, unknown>)
    : null
}

function preparedHandoff(response: Awaited<ReturnType<typeof prepareQualityJourneyHandoffAction>>) {
  const data = actionData(response)
  const prompt = typeof data?.prompt === 'string' ? data.prompt : null
  const handoffId = typeof data?.handoffId === 'string' ? data.handoffId : null
  return response.success && prompt && handoffId ? { prompt, handoffId } : null
}

async function copyCoordinatorPrompt(value: string) {
  await navigator.clipboard.writeText(value)
  toast({ title: 'Coordinator prompt copied', description: 'Paste it into the Codex task opened for this project.' })
}

function launchToast(
  response: Awaited<ReturnType<typeof launchQualityJourneyHandoffAction>>,
  copied: boolean,
  status: string,
) {
  if (response.success && status === 'LAUNCHING')
    return toast({
      title: 'Codex is opening',
      description: 'Another launch request is still in progress. Use the coordinator prompt when Codex appears.',
    })
  return response.success
    ? toast({
        title: 'Codex opened',
        description: copied
          ? 'The coordinator prompt is copied. Paste it into a new Codex task to connect this Journey.'
          : 'Copy the visible coordinator prompt into the new Codex task to connect this Journey.',
      })
    : toast({
        title: 'Codex is not ready',
        description: response.error ?? 'Copy the prompt and open Codex manually.',
        variant: 'destructive',
      })
}

async function executeHandoff(journeyId: string, update: (state: Partial<HandoffState>) => void) {
  const response = await prepareQualityJourneyHandoffAction({ journeyId })
  const prepared = preparedHandoff(response)
  if (!prepared) {
    toast({ title: 'Unable to prepare Codex', description: response.error, variant: 'destructive' })
    return
  }
  update({ ...prepared, status: 'PREPARED' })
  let copied = false
  try {
    await copyCoordinatorPrompt(prepared.prompt)
    copied = true
    update({ copied: true })
  } catch {
    // Clipboard permission is optional; the visible copy control remains available.
  }
  const launched = await launchQualityJourneyHandoffAction({ journeyId, handoffId: prepared.handoffId })
  const launchData = actionData(launched)
  const launchStatus = typeof launchData?.status === 'string' ? launchData.status : 'FAILED'
  update({ status: launchStatus })
  launchToast(launched, copied, launchStatus)
}

function LaunchButtonLabel({ hasHandoff }: { hasHandoff: boolean }) {
  return hasHandoff ? 'Open Codex again' : 'Prepare and open Codex'
}

function PromptRecovery({ copied, prompt, status }: { copied: boolean; prompt: string | null; status: string }) {
  if (!prompt && !['FAILED', 'EXPIRED'].includes(status)) return null
  if (!prompt)
    return (
      <section className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm" role="status">
        <p className="font-medium">Prepare a fresh prompt to recover</p>
        <p className="mt-1 text-muted-foreground">
          Choose Open Codex again to prepare a fresh prompt. You can then copy it and open Codex manually if needed.
        </p>
      </section>
    )
  const shouldShow = ['LAUNCHING', 'LAUNCHED', 'CONNECTED', 'FAILED', 'EXPIRED'].includes(status)
  if (!shouldShow) return null
  return (
    <section className="border-primary/20 bg-primary/[0.04] rounded-md border p-3 text-sm" role="status">
      <p className="font-medium">Paste and send the prepared prompt in Codex</p>
      <p className="mt-1 text-muted-foreground">
        {copied ? 'The prompt is copied.' : 'Use Copy coordinator prompt.'} If Codex did not open, open it manually,
        then paste and send the same prompt.
      </p>
    </section>
  )
}

function ObservedWorkerProgress({ hasObservedWorkerProgress }: { hasObservedWorkerProgress: boolean }) {
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {hasObservedWorkerProgress
        ? 'Observed worker progress: Appraise received a proposed test approach. Review the current version below.'
        : 'Observed worker progress: Appraise has not received submitted analysis work yet.'}
    </p>
  )
}

export function CoordinatorHandoffPanel({
  journeyId,
  handoff,
  hasObservedWorkerProgress,
}: {
  journeyId: string
  handoff: HandoffView
  hasObservedWorkerProgress: boolean
}) {
  const [state, setState] = useState<HandoffState>({
    prompt: null,
    handoffId: handoff?.id ?? null,
    status: handoff?.status ?? 'NOT_PREPARED',
    copied: false,
  })
  const { prompt, handoffId, status, copied } = state
  const [isPending, startTransition] = useTransition()
  const update = (next: Partial<HandoffState>) => setState(current => ({ ...current, ...next }))
  const displayStatus = isPending ? 'LAUNCHING' : status
  const guidance = codexHandoffGuidance(displayStatus)

  async function copyPrompt(value = prompt) {
    if (!value) return
    await copyCoordinatorPrompt(value)
    update({ copied: true })
  }

  function prepareAndLaunch() {
    startTransition(() => executeHandoff(journeyId, update))
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.035]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare aria-hidden="true" className="size-4 text-primary" />
              Codex coordinator
            </CardTitle>
            <CardDescription>
              Open Codex in the target workspace and connect it to this Appraise-owned Journey.
            </CardDescription>
          </div>
          <Badge variant="outline">{guidance.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Appraise remains lifecycle authority. Codex coordinates the analysis and stops at human questions and review
          gates.
        </p>
        <p className="text-sm text-muted-foreground">{guidance.description}</p>
        <ObservedWorkerProgress hasObservedWorkerProgress={hasObservedWorkerProgress} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={prepareAndLaunch} type="button">
            {isPending ? <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
            <LaunchButtonLabel hasHandoff={Boolean(handoffId)} />
          </Button>
          {prompt ? (
            <Button onClick={() => void copyPrompt()} type="button" variant="outline">
              {copied ? (
                <Check aria-hidden="true" className="mr-2 size-4" />
              ) : (
                <Clipboard aria-hidden="true" className="mr-2 size-4" />
              )}
              {copied ? 'Prompt copied' : 'Copy coordinator prompt'}
            </Button>
          ) : null}
          <Button asChild type="button" variant="ghost">
            <Link href="/projects">
              <ExternalLink aria-hidden="true" className="mr-2 size-4" />
              Agent setup
            </Link>
          </Button>
        </div>
        <PromptRecovery copied={copied} prompt={prompt} status={displayStatus} />
      </CardContent>
    </Card>
  )
}
