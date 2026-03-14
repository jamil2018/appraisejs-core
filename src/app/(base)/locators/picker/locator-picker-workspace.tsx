'use client'

import {
  closeLocatorPickerSessionAction,
  getLocatorPickerSessionAction,
  savePickedLocatorAction,
  startLocatorPickerSessionAction,
  toggleLocatorPickerSelectionModeAction,
} from '@/actions/locator-picker/locator-picker-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import type { LocatorPickerSession } from '@/types/locator-picker'
import { BrowserEngine, type Environment, type LocatorGroup, type Module } from '@prisma/client'
import { ExternalLink, Globe, Loader2, MousePointerClick, RefreshCw, Save, SquareX, Target } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

function statusTone(status: LocatorPickerSession['status']) {
  switch (status) {
    case 'ready':
      return 'secondary'
    case 'selecting':
      return 'default'
    case 'selected':
      return 'default'
    case 'saving':
      return 'secondary'
    case 'closed':
      return 'outline'
    case 'error':
      return 'destructive'
    case 'starting':
    default:
      return 'secondary'
  }
}

function formatStatus(status: LocatorPickerSession['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

interface LocatorPickerWorkspaceProps {
  environments: Environment[]
  locatorGroups: LocatorGroup[]
  modules: Module[]
}

export default function LocatorPickerWorkspace({ environments, locatorGroups, modules }: LocatorPickerWorkspaceProps) {
  const router = useRouter()
  const [sourceType, setSourceType] = useState<'environment' | 'url'>(environments.length > 0 ? 'environment' : 'url')
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '')
  const [url, setUrl] = useState('')
  const [browserEngine, setBrowserEngine] = useState<BrowserEngine>(BrowserEngine.CHROMIUM)
  const [session, setSession] = useState<LocatorPickerSession | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [locatorName, setLocatorName] = useState('')
  const [selectedSelector, setSelectedSelector] = useState('')
  const [resolutionMode, setResolutionMode] = useState<'existing' | 'create'>('create')
  const [existingLocatorGroupId, setExistingLocatorGroupId] = useState('')
  const [newLocatorGroupName, setNewLocatorGroupName] = useState('')
  const [route, setRoute] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [lastAutoLocatorName, setLastAutoLocatorName] = useState('')
  const [lastAutoExistingGroupId, setLastAutoExistingGroupId] = useState('')
  const [lastAutoGroupName, setLastAutoGroupName] = useState('')
  const [lastAutoRoute, setLastAutoRoute] = useState('')
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
        title: 'Unable to refresh picker session',
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
    if (!session) {
      return
    }

    if (session.suggestedLocatorName && (locatorName === '' || locatorName === lastAutoLocatorName)) {
      setLocatorName(session.suggestedLocatorName)
      setLastAutoLocatorName(session.suggestedLocatorName)
    }

    if (
      session.selectorCandidates.length > 0 &&
      !session.selectorCandidates.some(candidate => candidate.selector === selectedSelector)
    ) {
      setSelectedSelector(session.selectorCandidates[0].selector)
    }

    if (session.groupSuggestion) {
      setResolutionMode(currentMode =>
        currentMode === 'create' && session.groupSuggestion?.mode === 'existing' ? 'existing' : currentMode,
      )

      if (
        session.groupSuggestion.mode === 'existing' &&
        (existingLocatorGroupId === '' || existingLocatorGroupId === lastAutoExistingGroupId)
      ) {
        const nextExistingGroupId = session.groupSuggestion.existingLocatorGroupId ?? ''
        setExistingLocatorGroupId(nextExistingGroupId)
        setLastAutoExistingGroupId(nextExistingGroupId)
      }

      if (newLocatorGroupName === '' || newLocatorGroupName === lastAutoGroupName) {
        setNewLocatorGroupName(session.groupSuggestion.suggestedGroupName)
        setLastAutoGroupName(session.groupSuggestion.suggestedGroupName)
      }

      if (route === '' || route === lastAutoRoute) {
        setRoute(session.groupSuggestion.route)
        setLastAutoRoute(session.groupSuggestion.route)
      }

      if (session.groupSuggestion.suggestedModuleId && (moduleId === '' || moduleId === lastAutoModuleId)) {
        setModuleId(session.groupSuggestion.suggestedModuleId)
        setLastAutoModuleId(session.groupSuggestion.suggestedModuleId)
      }
    }
  }, [
    existingLocatorGroupId,
    lastAutoExistingGroupId,
    lastAutoGroupName,
    lastAutoLocatorName,
    lastAutoModuleId,
    lastAutoRoute,
    locatorName,
    moduleId,
    newLocatorGroupName,
    route,
    selectedSelector,
    session,
  ])

  const handleStart = async () => {
    setIsStarting(true)
    const response = await startLocatorPickerSessionAction({
      environmentId: sourceType === 'environment' ? environmentId : undefined,
      url: sourceType === 'url' ? url : undefined,
      browserEngine,
    })

    setIsStarting(false)

    if (response.data) {
      const nextSession = response.data as LocatorPickerSession
      setSession(nextSession)
      setLocatorName('')
      setSelectedSelector('')
      setExistingLocatorGroupId('')
      setNewLocatorGroupName('')
      setRoute('')
      setModuleId('')
      setLastAutoLocatorName('')
      setLastAutoExistingGroupId('')
      setLastAutoGroupName('')
      setLastAutoRoute('')
      setLastAutoModuleId('')
    }

    if (response.status !== 200) {
      toast({
        title: 'Unable to launch picker browser',
        description: response.error,
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Picker browser launched',
      description: 'Log in and navigate in the opened browser window, then enable selection mode here.',
    })
  }

  const handleToggleSelection = async () => {
    if (!session) {
      return
    }

    const response = await toggleLocatorPickerSelectionModeAction(session.sessionId, !session.selectionMode)
    if (response.status === 200) {
      setSession(response.data as LocatorPickerSession)
      return
    }

    toast({
      title: 'Unable to update selection mode',
      description: response.error,
      variant: 'destructive',
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
      title: 'Unable to close picker session',
      description: response.error,
      variant: 'destructive',
    })
  }

  const handleSave = async () => {
    if (!session) {
      return
    }

    setIsSaving(true)
    const response = await savePickedLocatorAction({
      sessionId: session.sessionId,
      locatorName,
      selector: selectedSelector,
      resolutionMode,
      existingLocatorGroupId: resolutionMode === 'existing' ? existingLocatorGroupId : undefined,
      newLocatorGroupName: resolutionMode === 'create' ? newLocatorGroupName : undefined,
      route,
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
    Boolean(session?.pickedElement) &&
    locatorName.trim() !== '' &&
    selectedSelector.trim() !== '' &&
    ((resolutionMode === 'existing' && existingLocatorGroupId !== '') ||
      (resolutionMode === 'create' && newLocatorGroupName.trim() !== '' && moduleId !== ''))

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Launch Picker</CardTitle>
            <CardDescription>
              Use a saved environment or paste a direct URL, then Appraise opens a Playwright-controlled browser window.
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
                  <div className="text-sm text-muted-foreground">Launch from an existing environment base URL.</div>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="url" id="source-url" />
                <div>
                  <div className="font-medium">Direct URL</div>
                  <div className="text-sm text-muted-foreground">Point the picker at any reachable page.</div>
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

            <div className="space-y-2">
              <Label>Browser</Label>
              <Select value={browserEngine} onValueChange={value => setBrowserEngine(value as BrowserEngine)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a browser" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BrowserEngine.CHROMIUM}>Chromium</SelectItem>
                  <SelectItem value={BrowserEngine.FIREFOX}>Firefox</SelectItem>
                  <SelectItem value={BrowserEngine.WEBKIT}>WebKit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleStart}
              disabled={isStarting || (sourceType === 'environment' ? environmentId === '' : url.trim() === '')}
            >
              {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
              Launch Browser
            </Button>

            <Alert>
              <ExternalLink className="h-4 w-4" />
              <AlertTitle>Manual navigation stays in the browser window</AlertTitle>
              <AlertDescription>
                Log in, move around the target app, then come back here and toggle selection mode when you are ready to
                click an element.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-2">
              <CardTitle>Session</CardTitle>
              <CardDescription>Current browser status, route inference, and picker controls.</CardDescription>
            </div>
            {session ? <Badge variant={statusTone(session.status)}>{formatStatus(session.status)}</Badge> : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {session ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Page</div>
                    <div className="mt-2 break-words text-sm font-medium">{session.pageTitle || 'Untitled page'}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Path</div>
                    <div className="mt-2 break-all font-mono text-sm">{session.currentPathname || '/'}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Source</div>
                    <div className="mt-2 break-all text-sm">
                      {session.launchSource.environmentName || session.launchSource.url}
                    </div>
                  </div>
                </div>

                {session.error ? (
                  <Alert variant="destructive">
                    <SquareX className="h-4 w-4" />
                    <AlertTitle>Picker issue</AlertTitle>
                    <AlertDescription>{session.error}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleToggleSelection}
                    disabled={
                      session.status === 'starting' || session.status === 'saving' || session.status === 'closed'
                    }
                  >
                    {session.selectionMode ? (
                      <MousePointerClick className="mr-2 h-4 w-4" />
                    ) : (
                      <Target className="mr-2 h-4 w-4" />
                    )}
                    {session.selectionMode ? 'Stop Selecting' : 'Enable Selection'}
                  </Button>
                  <Button variant="outline" onClick={() => void loadSession(session.sessionId)} disabled={isRefreshing}>
                    {isRefreshing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                  <Button variant="outline" onClick={handleClose}>
                    <SquareX className="mr-2 h-4 w-4" />
                    Close Session
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
                Start a picker session to open the browser window and begin selecting locators.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="min-h-[38rem]">
          <CardHeader>
            <CardTitle>Picked Element</CardTitle>
            <CardDescription>Element metadata captured from the live page.</CardDescription>
          </CardHeader>
          <CardContent>
            {session?.pickedElement ? (
              <ScrollArea className="h-[32rem] pr-4">
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Tag</div>
                      <div className="mt-2 font-mono text-sm">{session.pickedElement.tagName}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Frame</div>
                      <div className="mt-2 text-sm">
                        {session.pickedElement.isInFrame ? 'Inside iframe/frame' : 'Main document'}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Accessible name</div>
                      <div className="mt-2 text-sm">{session.pickedElement.accessibleName || 'Not available'}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Role</div>
                      <div className="mt-2 text-sm">{session.pickedElement.role || 'Not available'}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Text</Label>
                    <Input value={session.pickedElement.text || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Outer HTML</Label>
                    <Textarea value={session.pickedElement.outerHTML} readOnly className="min-h-40 font-mono text-xs" />
                  </div>

                  <div className="space-y-3">
                    <Label>Selector candidates</Label>
                    <div className="space-y-3">
                      {session.selectorCandidates.map(candidate => (
                        <button
                          key={candidate.selector}
                          type="button"
                          onClick={() => setSelectedSelector(candidate.selector)}
                          className={`w-full rounded-lg border p-4 text-left transition-colors ${
                            selectedSelector === candidate.selector
                              ? 'bg-primary/5 border-primary'
                              : 'hover:border-primary/50'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{candidate.strategy}</Badge>
                            {candidate.isUnique ? <Badge variant="secondary">Unique</Badge> : null}
                            {candidate.isVisible ? <Badge variant="secondary">Visible</Badge> : null}
                            <span className="text-xs text-muted-foreground">{candidate.description}</span>
                          </div>
                          <div className="mt-3 break-all font-mono text-xs">{candidate.selector}</div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            Matches: {candidate.count} | Score: {candidate.score}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex min-h-[32rem] items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground">
                Enable selection mode, then click an element in the launched browser window.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[38rem]">
          <CardHeader>
            <CardTitle>Save Locator</CardTitle>
            <CardDescription>
              Pick the selector to keep, resolve the target locator group, and write it into the existing automation
              projection flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="locator-name">Locator name</Label>
              <Input
                id="locator-name"
                value={locatorName}
                onChange={event => setLocatorName(event.target.value)}
                placeholder="Primary CTA button"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="selected-selector">Primary selector</Label>
              <Textarea
                id="selected-selector"
                value={selectedSelector}
                onChange={event => setSelectedSelector(event.target.value)}
                className="min-h-28 font-mono text-xs"
                placeholder="Choose a ranked selector or override it manually."
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Locator group resolution</Label>
              <RadioGroup
                value={resolutionMode}
                onValueChange={value => setResolutionMode(value as 'existing' | 'create')}
              >
                <label className="flex items-center gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="existing" id="existing-group" />
                  <div>
                    <div className="font-medium">Use existing exact-route group</div>
                    <div className="text-sm text-muted-foreground">
                      Best when the current route already maps to a saved locator group.
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="create" id="create-group" />
                  <div>
                    <div className="font-medium">Create a new locator group</div>
                    <div className="text-sm text-muted-foreground">
                      Use the inferred route and module, then adjust before saving.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {resolutionMode === 'existing' ? (
              <div className="space-y-2">
                <Label>Existing locator group</Label>
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
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-group-name">New locator group name</Label>
                  <Input
                    id="new-group-name"
                    value={newLocatorGroupName}
                    onChange={event => setNewLocatorGroupName(event.target.value)}
                    placeholder="Checkout Page"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="group-route">Route</Label>
                  <Input
                    id="group-route"
                    value={route}
                    onChange={event => setRoute(event.target.value)}
                    placeholder="/checkout"
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
                  {session?.groupSuggestion?.suggestedModulePath ? (
                    <p className="text-xs text-muted-foreground">
                      Suggested from route match: {session.groupSuggestion.suggestedModulePath}
                    </p>
                  ) : null}
                </div>
              </>
            )}

            <Button onClick={handleSave} disabled={!canSave || isSaving} className="w-full">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Locator
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
