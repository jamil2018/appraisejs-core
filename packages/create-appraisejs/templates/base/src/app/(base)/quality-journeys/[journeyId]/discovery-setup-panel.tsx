'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { selectTargetProjectAction } from '@/actions/target-project/target-project-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  DiscoveryPrerequisites,
  DiscoverySetupItem,
} from '@/services/coordinator/quality-journey-discovery-prerequisites'

const setupItems: Record<DiscoverySetupItem, { label: string; description: string; href: string }> = {
  environment: {
    label: 'Create environment',
    description: 'Register the target base URL in an active environment.',
    href: '/environments/create',
  },
  module: {
    label: 'Create module',
    description: 'Choose a destination module for the tests Discovery will inform.',
    href: '/modules/create',
  },
  'locator-group': {
    label: 'Create locator group',
    description: 'In that module, explicitly register each route Discovery may inspect. No locators are required yet.',
    href: '/locator-groups/create',
  },
}

type DiscoverySetupPanelProps = { prerequisites: DiscoveryPrerequisites; projectId: string }

export function DiscoverySetupPanel({ prerequisites, projectId }: DiscoverySetupPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (prerequisites.ready) return null

  function openSetup(href: string) {
    setError(null)
    startTransition(async () => {
      // Existing creation actions use the selected-project cookie. Align it with
      // this Journey before leaving a URL-scoped shared link.
      try {
        const response = await selectTargetProjectAction({ targetProjectId: projectId })
        if (!response.success) {
          setError(response.error ?? 'Unable to select this project for setup.')
          return
        }
        router.push(`${href}?project=${encodeURIComponent(projectId)}`)
      } catch {
        setError('Project selection was interrupted. Try opening setup again.')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up Discovery before approval</CardTitle>
        <CardDescription>
          This project needs the following active records. Create them in order, then return to this Journey and refresh
          before approving Analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-3">
          {prerequisites.missing.map(item => (
            <li key={item} className="space-y-2">
              <p className="text-sm text-muted-foreground">{setupItems[item].description}</p>
              <Button disabled={pending} onClick={() => openSetup(setupItems[item].href)} variant="outline">
                {setupItems[item].label}
              </Button>
            </li>
          ))}
        </ol>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
