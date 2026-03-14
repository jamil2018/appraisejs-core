'use client'

import {
  closeLocatorPickerSessionAction,
  getLocatorPickerSessionAction,
  savePickedLocatorAction,
  startLocatorPickerSessionAction,
} from '@/actions/locator-picker/locator-picker-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { inferGroupSuggestion, normalizeRoute, suggestLocatorName } from '@/lib/locator-picker/suggestions'
import type { LocatorPickerSession } from '@/types/locator-picker'
import type { Environment, LocatorGroup, Module } from '@prisma/client'
import { ExternalLink, Loader2, RefreshCw, Save, SquareX, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface CreateLocatorWorkspaceProps {
  environments: Environment[]
  locatorGroups: LocatorGroup[]
  modules: Module[]
}

function statusTone(status: LocatorPickerSession['status']) {
  switch (status) {
    case 'picked':
      return 'default'
    case 'saving':
      return 'secondary'
    case 'closed':
      return 'outline'
    case 'error':
      return 'destructive'
    case 'ready':
      return 'secondary'
    case 'starting':
    default:
      return 'secondary'
  }
}

function formatStatus(status: LocatorPickerSession['status']) {
  if (status === 'picked') {
    return 'Picked'
  }

  return status.charAt(0).toUpperCase() + status.slice(1)
}

export default function CreateLocatorWorkspace({
  environments,
  locatorGroups,
  modules,
}: CreateLocatorWorkspaceProps) {
  const router = useRouter()
  const [sourceType, setSourceType] = useState<'environment' | 'url'>(environments.length > 0 ? 'environment' : 'url')
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  const [url, setUrl] = useState('')
  const [session, setSession] = useState<LocatorPickerSession | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [payloadSignature, setPayloadSignature] = useState('')

  const [locatorName, setLocatorName] = useState('')
  const [selector, setSelector] = useState('')
  const [resolutionMode, setResolutionMode] = useState<'existing' | 'create'>('existing')
  const [existingLocatorGroupId, setExistingLocatorGroupId] = useState('')
  const [newLocatorGroupName, setNewLocatorGroupName] = useState('')
  const [route, setRoute] = useState('/')
  const [moduleId, setModuleId] = useState('')
  const [lastAutoLocatorName, setLastAutoLocatorName] = useState('')
  const [lastAutoSelector, setLastAutoSelector] = useState('')
  const [lastAutoExistingGroupId, setLastAutoExistingGroupId] = useState('')
  const [lastAutoGroupName, setLastAutoGroupName] = useState('')
  const [lastAutoRoute, setLastAutoRoute] = useState('/')
  const [lastAutoModuleId, setLastAutoModuleId] = useState('')

  const loadSession = async (sessionId: string, silent = false) => {
    if (!silent) {
      setIsRefreshing(true)
    }

    const response = await getLocatorPickerSessionAction(sessionId)
    if (response.status === 200) {
      setSession(response.data as LocatorPickerSession)
    } else if (!silent) {
      toast({
        title: 'Unable to refresh the picker session',
        description: response.error,
        variant: 'destructive',
      })
    }

    if (!silent) {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!session?.sessionId || session.status === 'closed') {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadSession(session.sessionId, true)
    }, 1500)

    return () => window.clearInterval(intervalId)
  }, [session?.sessionId, session?.status])

  useEffect(() => {
    const pickedLocator = session?.pickedLocator
    if (!pickedLocator) {
      return
    }

    const nextPayloadSignature = `${session?.updatedAt}:${pickedLocator.currentUrl}:${pickedLocator.selector}`
    if (nextPayloadSignature === payloadSignature) {
      return
    }

    setPayloadSignature(nextPayloadSignature)

    if (selector === '' || selector === lastAutoSelector) {
      setSelector(pickedLocator.selector)
      setLastAutoSelector(pickedLocator.selector)
    }

    const suggestedName = suggestLocatorName(pickedLocator)
    if (suggestedName && (locatorName === '' || locatorName === lastAutoLocatorName)) {
      setLocatorName(suggestedName)
      setLastAutoLocatorName(suggestedName)
    }

    const suggestion = inferGroupSuggestion(pickedLocator.pathname, pickedLocator.pageTitle, locatorGroups, modules)

    if (route === '/' || route === '' || route === lastAutoRoute) {
      setRoute(suggestion.route)
      setLastAutoRoute(suggestion.route)
    }

    if (suggestion.mode === 'existing') {
      setResolutionMode(currentMode => (currentMode === 'create' ? 'existing' : currentMode))

      const nextExistingGroupId = suggestion.existingLocatorGroupId ?? ''
      if (existingLocatorGroupId === '' || existingLocatorGroupId === lastAutoExistingGroupId) {
        setExistingLocatorGroupId(nextExistingGroupId)
        setLastAutoExistingGroupId(nextExistingGroupId)
      }
    } else {
      if (resolutionMode === 'create' || existingLocatorGroupId === '' || existingLocatorGroupId === lastAutoExistingGroupId) {
        setResolutionMode('create')
      }

      if (newLocatorGroupName === '' || newLocatorGroupName === lastAutoGroupName) {
        setNewLocatorGroupName(suggestion.suggestedGroupName)
        setLastAutoGroupName(suggestion.suggestedGroupName)
      }

      if (moduleId === '' || moduleId === lastAutoModuleId) {
        const nextModuleId = suggestion.suggestedModuleId ?? ''
        setModuleId(nextModuleId)
        setLastAutoModuleId(nextModuleId)
      }
    }
  }, [
    existingLocatorGroupId,
    lastAutoExistingGroupId,
    lastAutoGroupName,
    lastAutoLocatorName,
    lastAutoModuleId,
    lastAutoRoute,
    lastAutoSelector,
    locatorGroups,
    locatorName,
    moduleId,
    modules,
    newLocatorGroupName,
    payloadSignature,
    resolutionMode,
    route,
    selector,
    session,
  ])

  const handleStart = async () => {
    setIsStarting(true)
    const response = await startLocatorPickerSessionAction({
      environmentId: sourceType === 'environment' ? environmentId : undefined,
      url: sourceType === 'url' ? url : undefined,
    })
    setIsStarting(false)

    if (response.status !== 200 || !response.data) {
      toast({
        title: 'Unable to launch Chromium',
        description: response.error,
        variant: 'destructive',
      })
      return
    }

    setSession(response.data as LocatorPickerSession)
    setPayloadSignature('')
    setLastAutoLocatorName('')
    setLastAutoSelector('')
    setLastAutoExistingGroupId('')
    setLastAutoGroupName('')
    setLastAutoRoute('/')
    setLastAutoModuleId('')

    toast({
      title: 'Chromium launched',
      description: 'Use the in-browser Appraise picker panel to start picking, click one element, then confirm Use selector.',
    })
  }

  const handleClose = async () => {
    if (!session) {
      return
    }

    const response = await closeLocatorPickerSessionAction(session.sessionId)
    if (response.status === 200) {
      setSession(response.data as LocatorPickerSession)
      return
    }

    toast({
      title: 'Unable to close Chromium',
      description: response.error,
      variant: 'destructive',
    })
  }

  const handleSave = async () => {
    setIsSaving(true)

    const response = await savePickedLocatorAction({
      sessionId: session?.sessionId,
      locatorName,
      selector,
      resolutionMode,
      existingLocatorGroupId: resolutionMode === 'existing' ? existingLocatorGroupId : undefined,
      newLocatorGroupName: resolutionMode === 'create' ? newLocatorGroupName : undefined,
      route: resolutionMode === 'create' ? route : undefined,
      moduleId: resolutionMode === 'create' ? moduleId : undefined,
    })

    setIsSaving(false)

    if (response.status === 200) {
      toast({
        title: 'Locator saved',
        description: response.message,
      })
      router.push('/locators')
      router.refresh()
      return
    }

    toast({
      title: 'Unable to save locator',
      description: response.error,
      variant: 'destructive',
    })
  }

  const canSave =
    locatorName.trim() !== '' &&
    selector.trim() !== '' &&
    ((resolutionMode === 'existing' && existingLocatorGroupId !== '') ||
      (resolutionMode === 'create' && newLocatorGroupName.trim() !== '' && moduleId !== ''))

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Launch Chromium Picker</CardTitle>
            <CardDescription>
              Start a Chromium window from an environment or direct URL. The companion injects its own floating picker
              panel into that browser, so no extension is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={sourceType}
              onValueChange={value => setSourceType(value as 'environment' | 'url')}
              className="grid gap-3"
            >
              <label className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="environment" id="source-environment" disabled={environments.length === 0} />
                <div>
                  <div className="font-medium">Saved environment</div>
                  <div className="text-sm text-muted-foreground">Launch from an existing base URL.</div>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="url" id="source-url" />
                <div>
                  <div className="font-medium">Direct URL</div>
                  <div className="text-sm text-muted-foreground">Open any reachable page directly in Chromium.</div>
                </div>
              </label>
            </RadioGroup>

            {sourceType === 'environment' ? (
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select value={environmentId} onValueChange={setEnvironmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an environment" />
                  </SelectTrigger>
                  <SelectContent isEmpty={environments.length === 0}>
                    {environments.map(environment => (
                      <SelectItem key={environment.id} value={environment.id}>
                        {environment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="picker-url">URL</Label>
                <Input
                  id="picker-url"
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                  placeholder="https://example.com/login"
                />
              </div>
            )}

            <Button
              type="button"
              onClick={handleStart}
              disabled={isStarting || (sourceType === 'environment' ? environmentId === '' : url.trim() === '')}
              className="w-full"
            >
              {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
              Launch Chromium
            </Button>

            <Alert>
              <AlertTitle>Inside Chromium</AlertTitle>
              <AlertDescription>
                Use the Appraise picker panel in the page itself: start picking, hover to inspect, click one element,
                then confirm Use selector. The final selector returns here automatically.
              </AlertDescription>
            </Alert>

            {session ? (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Session</div>
                      <div className="text-xs text-muted-foreground">
                        {session.launchSource.environmentName ?? session.launchSource.url}
                      </div>
                      {session.companionPid ? (
                        <div className="text-[11px] text-muted-foreground">PID {session.companionPid}</div>
                      ) : null}
                    </div>
                    <Badge variant={statusTone(session.status)}>{formatStatus(session.status)}</Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="font-medium">Current page</div>
                    <div className="break-all text-muted-foreground">{session.currentUrl || session.launchSource.url}</div>
                    <div className="text-muted-foreground">{session.pageTitle || 'Waiting for page metadata'}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadSession(session.sessionId)}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Refresh
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                      <SquareX className="mr-2 h-4 w-4" />
                      Close Browser
                    </Button>
                  </div>

                  {session.error ? (
                    <Alert variant="destructive">
                      <AlertTitle>Picker error</AlertTitle>
                      <AlertDescription>{session.error}</AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Finalize Locator</CardTitle>
            <CardDescription>
              Manual selector entry still works. When a picker result arrives, Appraise fills in the selector and route
              defaults for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {session?.pickedLocator ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ExternalLink className="h-4 w-4" />
                  Picked from page
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="break-all">{session.pickedLocator.selector}</div>
                  <div>
                    {session.pickedLocator.tagName}
                    {session.pickedLocator.accessibleName ? ` • ${session.pickedLocator.accessibleName}` : ''}
                  </div>
                  <div className="break-all">{session.pickedLocator.currentUrl}</div>
                </div>
              </div>
            ) : (
              <Alert>
                <AlertTitle>Waiting for a picked selector</AlertTitle>
                <AlertDescription>
                  You can keep working manually below, or launch Chromium and pick one live element to populate these
                  fields.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="locator-name">Locator Name</Label>
                <Input
                  id="locator-name"
                  value={locatorName}
                  onChange={event => setLocatorName(event.target.value)}
                  placeholder="Enter locator name"
                />
              </div>

              <div className="space-y-2">
                <Label>Group Resolution</Label>
                <RadioGroup
                  value={resolutionMode}
                  onValueChange={value => setResolutionMode(value as 'existing' | 'create')}
                  className="grid gap-3"
                >
                  <label className="flex items-center gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="existing" id="group-existing" />
                    <div>
                      <div className="font-medium">Use existing group</div>
                      <div className="text-sm text-muted-foreground">Attach the locator to a saved route group.</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="create" id="group-create" />
                    <div>
                      <div className="font-medium">Create new group</div>
                      <div className="text-sm text-muted-foreground">Create and sync a new locator group on save.</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locator-selector">Selector</Label>
              <Textarea
                id="locator-selector"
                value={selector}
                onChange={event => setSelector(event.target.value)}
                placeholder="Playwright selector or XPath"
                className="min-h-28"
              />
            </div>

            {resolutionMode === 'existing' ? (
              <div className="space-y-2">
                <Label>Locator Group</Label>
                <Select value={existingLocatorGroupId} onValueChange={setExistingLocatorGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a locator group" />
                  </SelectTrigger>
                  <SelectContent isEmpty={locatorGroups.length === 0}>
                    {locatorGroups.map(locatorGroup => (
                      <SelectItem key={locatorGroup.id} value={locatorGroup.id}>
                        {locatorGroup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="new-group-name">Locator Group Name</Label>
                  <Input
                    id="new-group-name"
                    value={newLocatorGroupName}
                    onChange={event => setNewLocatorGroupName(event.target.value)}
                    placeholder="Enter group name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-group-route">Route</Label>
                  <Input
                    id="new-group-route"
                    value={route}
                    onChange={event => setRoute(normalizeRoute(event.target.value))}
                    placeholder="/account/settings"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Module</Label>
                  <Select value={moduleId} onValueChange={setModuleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a module" />
                    </SelectTrigger>
                    <SelectContent isEmpty={modules.length === 0}>
                      {modules.map(module => (
                        <SelectItem key={module.id} value={module.id}>
                          {module.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={handleSave} disabled={!canSave || isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Locator
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
