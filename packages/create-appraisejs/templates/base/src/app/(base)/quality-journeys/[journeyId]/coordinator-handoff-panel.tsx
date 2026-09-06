'use client'

import { Check, Clipboard, ExternalLink, LoaderCircle, TerminalSquare } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

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

function LaunchButtonLabel({ isPending, hasHandoff }: { isPending: boolean; hasHandoff: boolean }) {
  if (isPending) return 'Opening Codex…'
  return hasHandoff ? 'Reconnect with Codex' : 'Start requirement analysis'
}

export function CoordinatorHandoffPanel({ journeyId, handoff }: { journeyId: string; handoff: HandoffView }) {
  const [state, setState] = useState<HandoffState>({
    prompt: null,
    handoffId: handoff?.id ?? null,
    status: handoff?.status ?? 'NOT_PREPARED',
    copied: false,
  })
  const { prompt, handoffId, status, copied } = state
  const [isPending, startTransition] = useTransition()
  const update = (next: Partial<HandoffState>) => setState(current => ({ ...current, ...next }))

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
          <Badge variant="outline">{status.replaceAll('_', ' ').toLocaleLowerCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Appraise remains lifecycle authority. Codex coordinates the analysis and stops at human questions and review
          gates.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isPending} onClick={prepareAndLaunch} type="button">
            {isPending ? <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
            <LaunchButtonLabel hasHandoff={Boolean(handoffId)} isPending={isPending} />
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
        {status === 'FAILED' ? (
          <p className="text-sm text-amber-200" role="status">
            Codex could not be opened automatically. Use Agent setup, then copy the prompt into Codex manually.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
