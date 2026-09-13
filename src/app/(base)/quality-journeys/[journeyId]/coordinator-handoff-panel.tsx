'use client'

import { Check, Clipboard, ExternalLink, LoaderCircle, ShieldCheck, TerminalSquare } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { codexHandoffGuidance, qualityJourneyStatusProjection } from '@/lib/quality-journey/presentation'

import {
  approveQualityJourneyHandoffTakeoverAction,
  launchQualityJourneyHandoffAction,
  inspectQualityJourneyHandoffAction,
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
  generation?: number
  takeoverAt?: Date | null
} | null

type HandoffState = {
  prompt: string | null
  handoffId: string | null
  launchUrl: string | null
  status: string
  copied: boolean
  takeoverApproval: string | null
  takeoverRequestId: string | null
  generation: number | null
  takeoverEffective: boolean
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
  const launchUrl = typeof data?.launchUrl === 'string' ? data.launchUrl : null
  const takeoverApproval = typeof data?.takeoverApproval === 'string' ? data.takeoverApproval : null
  const takeoverRequestId = typeof data?.takeoverRequestId === 'string' ? data.takeoverRequestId : null
  const generation = typeof data?.generation === 'number' ? data.generation : null
  return response.success && prompt && handoffId && launchUrl && takeoverApproval && takeoverRequestId && generation
    ? { prompt, handoffId, launchUrl, takeoverApproval, takeoverRequestId, generation }
    : null
}

async function copyCoordinatorPrompt(value: string) {
  await navigator.clipboard.writeText(value)
  toast({ title: 'Coordinator prompt copied', description: 'Paste it into the Codex task opened for this project.' })
}

function clipboardFailureToast() {
  toast({
    title: 'Copy the prompt manually',
    description: 'Clipboard access was denied. The prepared prompt remains available on this page.',
    variant: 'destructive',
  })
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
        title: 'Codex launch requested',
        description: copied
          ? 'The coordinator prompt is copied. Send it in Codex to connect this Journey.'
          : 'Copy and send the visible coordinator prompt in Codex to connect this Journey.',
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
    clipboardFailureToast()
  }
  const launched = await launchQualityJourneyHandoffAction({
    journeyId,
    handoffId: prepared.handoffId,
    launchUrl: prepared.launchUrl,
  })
  const launchData = actionData(launched)
  const launchStatus = typeof launchData?.status === 'string' ? launchData.status : 'FAILED'
  update({ status: launchStatus })
  launchToast(launched, copied, launchStatus)
}

function LaunchButtonLabel({ hasHandoff }: { hasHandoff: boolean }) {
  return hasHandoff ? 'Open Codex again' : 'Prepare and open Codex'
}

async function approveTakeover(
  journeyId: string,
  handoffId: string,
  generation: number,
  takeoverApproval: string,
  takeoverRequestId: string,
  update: (state: Partial<HandoffState>) => void,
) {
  const response = await approveQualityJourneyHandoffTakeoverAction({
    journeyId,
    handoffId,
    generation,
    takeoverApproval,
    takeoverRequestId,
  })
  if (!response.success) {
    toast({ title: 'Takeover was not approved', description: response.error, variant: 'destructive' })
    return
  }
  update({ takeoverEffective: true, status: 'CONNECTED' })
  toast({
    title: 'Coordinator takeover approved',
    description:
      'Appraise fenced the prior coordinator session and re-read the authoritative Journey before admitting this one.',
  })
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

export function CoordinatorHandoffPanel({
  journeyId,
  handoff,
  hasObservedWorkerProgress,
  projectId,
  stage = 'ANALYSIS',
}: {
  journeyId: string
  handoff: HandoffView
  hasObservedWorkerProgress: boolean
  projectId: string
  stage?: string
}) {
  const [state, setState] = useState<HandoffState>({
    prompt: null,
    handoffId: handoff?.id ?? null,
    launchUrl: null,
    status: handoff?.status ?? 'NOT_PREPARED',
    copied: false,
    takeoverApproval: null,
    takeoverRequestId: null,
    generation: handoff?.generation ?? null,
    takeoverEffective: Boolean(handoff?.takeoverAt),
  })
  const { prompt, handoffId, status, copied, takeoverApproval, takeoverRequestId, generation, takeoverEffective } =
    state
  const [isPending, startTransition] = useTransition()
  const update = (next: Partial<HandoffState>) => setState(current => ({ ...current, ...next }))
  const displayStatus = isPending ? 'LAUNCHING' : status
  const guidance = codexHandoffGuidance(displayStatus)
  const statusProjection = qualityJourneyStatusProjection({
    stage: stage as Parameters<typeof qualityJourneyStatusProjection>[0]['stage'],
    blockerCount: 0,
    unresolvedRequiredQuestionCount: 0,
    hasObservedWorkerProgress,
    handoffStatus: displayStatus,
    handoffLaunchedAt: handoff?.launchedAt,
    handoffConnectedAt: handoff?.connectedAt,
  })

  useEffect(() => {
    if (!['LAUNCHING', 'LAUNCHED'].includes(status)) return
    let cancelled = false
    const observe = async () => {
      const response = await inspectQualityJourneyHandoffAction({ journeyId })
      const data = actionData(response)
      const observed = data?.handoff
      if (!cancelled && observed && typeof observed === 'object') {
        const observedStatus = (observed as Record<string, unknown>).status
        if (typeof observedStatus === 'string') update({ status: observedStatus })
      }
    }
    void observe()
    const interval = window.setInterval(() => void observe(), 10_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [journeyId, status])

  async function copyPrompt(value = prompt) {
    if (!value) return
    try {
      await copyCoordinatorPrompt(value)
      update({ copied: true })
    } catch {
      clipboardFailureToast()
    }
  }

  function prepareAndLaunch() {
    startTransition(() => executeHandoff(journeyId, update))
  }

  function requestTakeoverApproval() {
    if (!handoffId || !takeoverApproval || !takeoverRequestId || !generation) return
    startTransition(() =>
      approveTakeover(journeyId, handoffId, generation, takeoverApproval, takeoverRequestId, update),
    )
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
              Open Codex in the selected host context and connect it to this Appraise-owned Journey target.
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
        <div className="space-y-1 text-sm" role="status">
          <p className="font-medium">{statusProjection.summary}</p>
          <p className="text-muted-foreground">Next actor: {statusProjection.nextActor}</p>
          <p className="text-xs text-muted-foreground">Last observed: {statusProjection.lastObserved.summary}</p>
        </div>
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
          {status === 'CONNECTED' && !takeoverEffective && takeoverApproval && takeoverRequestId && generation ? (
            <Button disabled={isPending} onClick={requestTakeoverApproval} type="button" variant="secondary">
              {isPending ? (
                <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" className="mr-2 size-4" />
              )}
              Approve coordinator takeover
            </Button>
          ) : null}
          <Button asChild type="button" variant="ghost">
            <Link
              href={`/projects?agentSetup=codex&project=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(
                `/quality-journeys/${journeyId}?project=${projectId}#analysis`,
              )}`}
            >
              <ExternalLink aria-hidden="true" className="mr-2 size-4" />
              Agent setup
            </Link>
          </Button>
        </div>
        <PromptRecovery copied={copied} prompt={prompt} status={displayStatus} />
        {status === 'CONNECTED' && !takeoverEffective && !takeoverApproval ? (
          <section className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm" role="status">
            <p className="font-medium">Takeover approval was not retained after reload</p>
            <p className="mt-1 text-muted-foreground">
              Appraise has not transferred coordinator-session ownership. Prepare a fresh scoped handoff, redeem it, and
              explicitly approve takeover from the same page state.
            </p>
          </section>
        ) : null}
        {takeoverEffective ? (
          <p className="text-sm text-muted-foreground" role="status">
            This coordinator session is effective. Appraise remains the lifecycle authority; no work lease or role
            execution authority was transferred.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
