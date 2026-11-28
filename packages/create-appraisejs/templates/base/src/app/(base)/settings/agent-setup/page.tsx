import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import prisma from '@/config/db-config'
import { requireActiveProject } from '@/lib/active-project'
import {
  getManagedJourneyReadinessForProvider,
  managedJourneyReadinessStage,
  managedJourneyFullyEnabled,
} from '@/services/coordinator/app-managed-journey-readiness'
import { managedJourneyProvider, type ManagedJourneyProvider } from '@/services/coordinator/app-managed-provider-sender'

import { CopyBriefWithAssistant } from '../../quality-journeys/[journeyId]/copy-brief-with-assistant'
import { ClaudeCodeSettings } from '../claude-code-settings'
import { AgentSetupRefresh } from './refresh'

export const metadata: Metadata = { title: 'Set up a Journey assistant' }

type Search = { project?: string; provider?: string; returnTo?: string }

function safeReturnTo(value: string | undefined, projectId: string) {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const url = new URL(value, 'http://appraise.local')
    if (url.origin !== 'http://appraise.local' || url.searchParams.get('project') !== projectId) return null
    if (!/^\/quality-journeys\/(?:new|[A-Za-z0-9._:-]+|drafts\/[A-Za-z0-9._:-]+)$/.test(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

function alternateDraftHref(returnTo: string | null, provider: ManagedJourneyProvider) {
  if (!returnTo) return null
  const url = new URL(returnTo, 'http://appraise.local')
  if (!/^\/quality-journeys\/(?:new|drafts\/[A-Za-z0-9._:-]+)$/.test(url.pathname)) return null
  url.searchParams.set('assistant', provider)
  return `${url.pathname}${url.search}${url.hash}`
}

async function journeyForReturn(returnTo: string | null, projectId: string) {
  if (!returnTo) return undefined
  const journeyId = new URL(returnTo, 'http://appraise.local').pathname.match(
    /^\/quality-journeys\/([A-Za-z0-9._:-]+)$/,
  )?.[1]
  if (!journeyId || journeyId === 'new') return undefined
  const journey = await prisma.qualityJourney.findFirst({
    where: { id: journeyId, targetProjectId: projectId },
    select: {
      stage: true,
      managedWorkerProvider: true,
      activeDiscoveryRevision: { select: { status: true } },
    },
  })
  return journey
    ? {
        journeyId,
        stage: managedJourneyReadinessStage(journey.stage, journey.activeDiscoveryRevision?.status),
        provider: managedJourneyProvider(journey),
      }
    : undefined
}

export default async function AgentSetupPage({ searchParams }: { searchParams?: Promise<Search> }) {
  const params = (await searchParams) ?? {}
  if (params.provider !== 'CODEX' && params.provider !== 'CLAUDE_CODE') notFound()
  const project = await requireActiveProject(params.project)
  const returnTo = safeReturnTo(params.returnTo, project.id)
  const backHref = returnTo ?? `/quality-journeys/new?project=${encodeURIComponent(project.id)}`
  const savedJourney = await journeyForReturn(returnTo, project.id)
  const provider: ManagedJourneyProvider = savedJourney?.provider ?? params.provider
  const scope = { targetProjectId: project.id, returnTo: backHref, stage: savedJourney?.stage }
  const selected = await getManagedJourneyReadinessForProvider(scope, provider)
  const alternateProvider = provider === 'CODEX' ? 'CLAUDE_CODE' : 'CODEX'
  const other = selected.ready ? null : await getManagedJourneyReadinessForProvider(scope, alternateProvider)
  const alternateHref =
    other?.ready && managedJourneyFullyEnabled(alternateProvider)
      ? alternateDraftHref(returnTo, alternateProvider)
      : null
  const alternateCopyAvailable =
    !selected.ready &&
    savedJourney &&
    other?.ready &&
    managedJourneyFullyEnabled(alternateProvider) &&
    (await prisma.qualityJourneyWorkAttempt.count({
      where: { workItem: { journeyId: savedJourney.journeyId, targetProjectId: project.id } },
    })) === 0
  const name = provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'
  const alternateName = alternateProvider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'
  const showClaudeControls =
    provider === 'CLAUDE_CODE' && ['sign_in', 'install', 'check_connection'].includes(selected.state)
  const claudeStatus =
    showClaudeControls && selected.connectionStatus ? { ...selected.connectionStatus, message: undefined } : null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link className="app-focus w-fit text-sm text-muted-foreground underline" href={backHref}>
        Return to your brief
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Set up {name}</CardTitle>
          <CardDescription>
            {selected.ready
              ? `${name} passed the setup check. Appraise checks again when work begins.`
              : (selected.reason ?? `${name} needs setup before it can work on your Journey.`)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {provider === 'CODEX' && selected.state === 'sign_in' ? (
            <div className="space-y-3 text-sm">
              <p>Open ChatGPT on this computer, choose Codex, and sign in. Then return here and check again.</p>
              <AgentSetupRefresh />
            </div>
          ) : null}
          {provider === 'CODEX' && selected.state === 'install' ? (
            <div className="space-y-3 text-sm">
              <p>
                Install or update ChatGPT on this computer, open Codex, and sign in. Then return here and check again.
              </p>
              <a
                className="app-focus inline-block text-primary underline"
                href="https://chatgpt.com/download/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get ChatGPT
              </a>
              <div>
                <AgentSetupRefresh />
              </div>
            </div>
          ) : null}
          {provider === 'CODEX' && selected.state === 'check_connection' ? (
            <div className="space-y-3 text-sm">
              <p>Open ChatGPT on this computer and check your Codex sign-in, then return here and check again.</p>
              <AgentSetupRefresh />
            </div>
          ) : null}
          {showClaudeControls && claudeStatus ? (
            <div className="space-y-3">
              <p className="text-sm">Use the connection control below, then check again.</p>
              <div className="rounded-lg border border-border">
                <ClaudeCodeSettings initialStatus={claudeStatus} />
              </div>
              <AgentSetupRefresh />
            </div>
          ) : null}
          {selected.ready ? (
            <Button nativeButton={false} render={<Link href={backHref} />}>
              Continue your brief
            </Button>
          ) : selected.state === 'unavailable' ? (
            <p className="text-sm text-muted-foreground">
              This assistant cannot be enabled from this page. Your brief stays saved; return to it when this workspace
              is ready.
            </p>
          ) : null}
          {!selected.ready && alternateHref ? (
            <Button nativeButton={false} variant="outline" render={<Link href={alternateHref} />}>
              Use {alternateName} for this brief
            </Button>
          ) : null}
          {alternateCopyAvailable ? (
            <CopyBriefWithAssistant
              journeyId={savedJourney.journeyId}
              projectId={project.id}
              provider={alternateProvider}
            />
          ) : null}
          {!selected.ready && !other?.ready ? (
            <p className="text-sm text-muted-foreground">
              Neither assistant is ready for Journeys in this workspace yet. Your saved brief is still available.
            </p>
          ) : null}
          {!selected.ready ? (
            <Button nativeButton={false} variant="outline" render={<Link href={backHref} />}>
              Return to your brief
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
