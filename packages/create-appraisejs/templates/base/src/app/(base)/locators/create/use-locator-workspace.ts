'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  getLocatorPickerSessionAction,
  savePickedLocatorAction,
  startLocatorPickerSessionAction,
} from '@/actions/locator-picker/locator-picker-actions'
import { toast } from '@/hooks/use-toast'
import type { LocatorPickerSession } from '@/types/locator-picker'

import {
  applyPickedLocatorToWorkspaceState,
  canLaunchPicker,
  canSaveLocator,
  createInitialWorkspaceState,
  createWorkspaceAutoFillSnapshot,
  getInlineLocatorSaveResult,
  getLocatorPickerSession,
  getPickerPayloadSignature,
  type CreateLocatorWorkspaceProps,
  type GroupResolutionMode,
  type LocatorSourceType,
} from './create-locator-workspace-helpers'

export function useLocatorWorkspace({
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
  const router = useRouter()
  const payloadSignatureRef = useRef('')
  const isModifyMode = mode === 'modify'
  const isInlineMode = displayMode === 'inline'

  const [state, setState] = useState(() => createInitialWorkspaceState(environments, initialValues))
  const [session, setSession] = useState<LocatorPickerSession | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadSession = async (sessionId: string, silent = false) => {
    const response = await getLocatorPickerSessionAction(sessionId)
    const nextSession = getLocatorPickerSession(response.data)

    if (response.status === 200 && nextSession) {
      setSession(nextSession)
    } else if (!silent) {
      toast({
        title: 'Unable to refresh the picker session',
        description: response.error || 'Failed to refresh the picker session.',
        variant: 'destructive',
      })
    }
  }

  useEffect(() => {
    if (!session?.sessionId || session.status === 'closed' || !session.companionPid) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadSession(session.sessionId, true)
    }, 1500)

    return () => window.clearInterval(intervalId)
  }, [session?.companionPid, session?.sessionId, session?.status])

  useEffect(() => {
    const nextPayloadSignature = getPickerPayloadSignature(session)
    if (
      !session?.pickedLocator ||
      nextPayloadSignature === '' ||
      nextPayloadSignature === payloadSignatureRef.current
    ) {
      return
    }

    payloadSignatureRef.current = nextPayloadSignature

    const timeoutId = window.setTimeout(() => {
      setState(currentState => applyPickedLocatorToWorkspaceState(currentState, session, locatorGroups, modules))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [locatorGroups, modules, session])

  const handleStart = async () => {
    setIsStarting(true)

    const response = await startLocatorPickerSessionAction({
      environmentId: state.sourceType === 'environment' ? state.environmentId : undefined,
      url: state.sourceType === 'url' ? state.url : undefined,
    })

    setIsStarting(false)

    const nextSession = getLocatorPickerSession(response.data)

    if (response.status !== 200 || !nextSession) {
      toast({
        title: 'Unable to launch Chromium',
        description: response.error || 'Failed to launch Chromium.',
        variant: 'destructive',
      })
      return
    }

    setSession(nextSession)
    payloadSignatureRef.current = ''
    setState(currentState => ({
      ...currentState,
      ...createWorkspaceAutoFillSnapshot(currentState),
    }))

    toast({
      title: 'Chromium launched',
      description:
        'Use the in-browser Appraise picker panel to start picking, click one element, then confirm Use selector.',
    })
  }

  const handleSave = async () => {
    setIsSaving(true)

    const response = await savePickedLocatorAction({
      locatorId,
      sessionId: session?.sessionId,
      locatorName: state.locatorName,
      selector: state.selector,
      resolutionMode: state.resolutionMode,
      existingLocatorGroupId: state.resolutionMode === 'existing' ? state.existingLocatorGroupId : undefined,
      newLocatorGroupName: state.resolutionMode === 'create' ? state.newLocatorGroupName : undefined,
      route: state.resolutionMode === 'create' ? state.route : undefined,
      moduleId: state.resolutionMode === 'create' ? state.moduleId : undefined,
    })

    setIsSaving(false)

    if (response.status === 200) {
      toast({
        title: isModifyMode ? 'Locator updated' : 'Locator saved',
        description: response.message,
      })
      const saveResult = getInlineLocatorSaveResult(response.data)

      if (isInlineMode && saveResult) {
        await onSaveSuccess?.(saveResult)
        onClose?.()
      } else {
        router.push('/locators')
        router.refresh()
      }
      return
    }

    toast({
      title: 'Unable to save locator',
      description: response.error || 'Failed to save the locator.',
      variant: 'destructive',
    })
  }

  const derivedState = useMemo(
    () => ({
      canLaunch: canLaunchPicker(state),
      canSave: canSaveLocator(state),
    }),
    [state],
  )

  return {
    isModifyMode,
    isInlineMode,
    session,
    state,
    isStarting,
    isSaving,
    setSourceType: (sourceType: LocatorSourceType) => setState(current => ({ ...current, sourceType })),
    setEnvironmentId: (environmentId: string) => setState(current => ({ ...current, environmentId })),
    setUrl: (url: string) => setState(current => ({ ...current, url })),
    setLocatorName: (locatorName: string) => setState(current => ({ ...current, locatorName })),
    setSelector: (selector: string) => setState(current => ({ ...current, selector })),
    setResolutionMode: (resolutionMode: GroupResolutionMode) => setState(current => ({ ...current, resolutionMode })),
    setExistingLocatorGroupId: (existingLocatorGroupId: string) =>
      setState(current => ({ ...current, existingLocatorGroupId })),
    setNewLocatorGroupName: (newLocatorGroupName: string) => setState(current => ({ ...current, newLocatorGroupName })),
    setRoute: (route: string) => setState(current => ({ ...current, route })),
    setModuleId: (moduleId: string) => setState(current => ({ ...current, moduleId })),
    handleStart,
    handleSave,
    ...derivedState,
  }
}
