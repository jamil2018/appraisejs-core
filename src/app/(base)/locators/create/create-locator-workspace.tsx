'use client'

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
import { ExternalLink, Loader2, Save, Target } from 'lucide-react'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import type { PickedLocatorPayload } from '@/types/locator-picker'
import type { CreateLocatorWorkspaceProps } from './create-locator-workspace-helpers'
import {
  formatStatus,
  getLocatorSourceType,
  getLocatorWorkspaceResolutionMode,
  statusTone,
} from './create-locator-workspace-helpers'
import { useLocatorWorkspace } from './use-locator-workspace'

function PickedLocatorObservation({ pickedLocator }: { pickedLocator: PickedLocatorPayload }) {
  return (
    <div className="bg-muted/30 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ExternalLink className="size-4" />
        Picked from page
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <div className="break-all">{pickedLocator.selector}</div>
        <div>
          {pickedLocator.tagName}
          {pickedLocator.accessibleName ? ` • ${pickedLocator.accessibleName}` : ''}
        </div>
        <div className="break-all">{pickedLocator.currentUrl}</div>
        {pickedLocator.matchCount === 1 && pickedLocator.checkedAt ? (
          <div>
            Verified as one live match at {pickedLocator.checkedAt} on{' '}
            <span className="break-all">{pickedLocator.checkedUrl}</span>. Runtime rechecks this cardinality before
            acting.
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function CreateLocatorWorkspace({
  environments,
  locatorGroups,
  modules,
  mode = 'create',
  displayMode = 'page',
  locatorId,
  initialValues,
  onSaveSuccess,
  onClose,
}: CreateLocatorWorkspaceProps) {
  const {
    isModifyMode,
    session,
    state,
    isStarting,
    isSaving,
    setSourceType,
    setEnvironmentId,
    setUrl,
    setLocatorName,
    setSelector,
    setResolutionMode,
    setExistingLocatorGroupId,
    setNewLocatorGroupName,
    setRoute,
    setModuleId,
    handleStart,
    handleSave,
    canLaunch,
    canSave,
  } = useLocatorWorkspace({
    environments,
    locatorGroups,
    modules,
    mode,
    displayMode,
    locatorId,
    initialValues,
    onSaveSuccess,
    onClose,
  })

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Launch Chromium Picker</CardTitle>
            <CardDescription>
              Start a Chromium window from an environment or direct URL. The companion injects its own floating picker
              panel into that browser, so no extension is required. Use this to repick the selector while editing or to
              capture a new one from scratch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={state.sourceType}
              onValueChange={value => setSourceType(getLocatorSourceType(value))}
              className="grid gap-3"
            >
              <label htmlFor="source-environment" className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="environment" id="source-environment" disabled={environments.length === 0} />
                <div>
                  <div className="font-medium">Saved environment</div>
                  <div className="text-sm text-muted-foreground">Launch from an existing base URL.</div>
                </div>
              </label>
              <label htmlFor="source-url" className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value="url" id="source-url" />
                <div>
                  <div className="font-medium">Direct URL</div>
                  <div className="text-sm text-muted-foreground">Open any reachable page directly in Chromium.</div>
                </div>
              </label>
            </RadioGroup>

            {state.sourceType === 'environment' ? (
              <div className="space-y-2">
                <Label htmlFor="picker-environment">Environment</Label>
                <Select value={state.environmentId} onValueChange={setEnvironmentId}>
                  <SelectTrigger id="picker-environment">
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
                  value={state.url}
                  onChange={event => setUrl(event.target.value)}
                  placeholder="https://example.com/login"
                />
              </div>
            )}

            <Button type="button" onClick={handleStart} disabled={isStarting || !canLaunch} className="w-full">
              {isStarting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Target className="mr-2 size-4" />}
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
                    <div className="break-all text-muted-foreground">
                      {session.currentUrl || session.launchSource.url}
                    </div>
                    <div className="text-muted-foreground">{session.pageTitle || 'Waiting for page metadata'}</div>
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
            <CardTitle>{isModifyMode ? 'Update Locator' : 'Finalize Locator'}</CardTitle>
            <CardDescription>
              Manual selector entry still works. When a picker result arrives, Appraise fills in the selector and route
              defaults for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {session?.pickedLocator ? (
              <PickedLocatorObservation pickedLocator={session.pickedLocator} />
            ) : (
              <Alert>
                <AlertTitle>Waiting for a picked selector</AlertTitle>
                <AlertDescription>
                  You can keep working manually below, but manual and file-backed selectors are uniqueness-unverified at
                  authoring. Managed runtime validates their required cardinality before acting.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="locator-name">Locator Name</Label>
                <Input
                  id="locator-name"
                  value={state.locatorName}
                  onChange={event => setLocatorName(event.target.value)}
                  placeholder="Enter locator name"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Group Resolution</div>
                <RadioGroup
                  value={state.resolutionMode}
                  onValueChange={value => setResolutionMode(getLocatorWorkspaceResolutionMode(value))}
                  className="grid gap-3"
                >
                  <label htmlFor="group-existing" className="flex items-center gap-3 rounded-lg border p-3">
                    <RadioGroupItem value="existing" id="group-existing" />
                    <div>
                      <div className="font-medium">Use existing group</div>
                      <div className="text-sm text-muted-foreground">Attach the locator to a saved route group.</div>
                    </div>
                  </label>
                  <label htmlFor="group-create" className="flex items-center gap-3 rounded-lg border p-3">
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
                value={state.selector}
                onChange={event => setSelector(event.target.value)}
                placeholder="Playwright selector or XPath"
                className="min-h-28"
              />
            </div>

            {state.resolutionMode === 'existing' ? (
              <div className="space-y-2">
                <Label htmlFor="existing-locator-group">Locator Group</Label>
                <Select value={state.existingLocatorGroupId} onValueChange={setExistingLocatorGroupId}>
                  <SelectTrigger id="existing-locator-group">
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
                    value={state.newLocatorGroupName}
                    onChange={event => setNewLocatorGroupName(event.target.value)}
                    placeholder="Enter group name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-group-route">Route</Label>
                  <Input
                    id="new-group-route"
                    value={state.route}
                    onChange={event => setRoute(normalizeRoute(event.target.value))}
                    placeholder="/account/settings"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-group-module">Module</Label>
                  <Select value={state.moduleId} onValueChange={setModuleId}>
                    <SelectTrigger id="new-group-module">
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
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                {isModifyMode ? 'Update Locator' : 'Save Locator'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
