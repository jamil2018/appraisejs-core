'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

import type { JourneyFocus } from './journey-focus-projection'
import { useJourneyStatusFreshness } from './journey-status-observation'

export function JourneyFocusCard({
  focus,
  href,
  children,
}: {
  focus: JourneyFocus
  href?: string
  children?: ReactNode
}) {
  const freshness = useJourneyStatusFreshness()
  return (
    <article
      aria-label={focus.title}
      className="space-y-2 rounded-xl border border-border bg-card px-4 py-3"
      data-journey-focus={focus.kind}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold">{focus.title}</h2>
          <p className="break-words text-sm leading-5">{focus.summary}</p>
        </div>
        {freshness.newerVersionAvailable ? (
          <Button
            size="sm"
            variant="outline"
            disabled={freshness.loadingNewerVersion}
            onClick={freshness.loadNewerVersion}
          >
            Load latest Journey
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={href ?? '#' + focus.destination} />}
          >
            {focus.action}
          </Button>
        )}
      </div>
      {freshness.newerVersionAvailable ? (
        <p className="text-xs text-warning" role="status">
          A newer version is available. Load it before reviewing this scope.
        </p>
      ) : null}
      {children}
      {focus.details.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="app-focus w-fit cursor-pointer rounded-md">Scope and revision</summary>
          <ul className="mt-2 space-y-1" aria-label={focus.title + ' scope'}>
            {focus.details.map(item => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}
