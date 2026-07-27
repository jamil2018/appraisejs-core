import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { useCallback, useMemo, useState } from 'react'

export type StepInvocationResources = {
  locators: Array<{ id: string; name: string; locatorGroupId: string | null }>
  locatorGroups: Array<{ id: string; name: string; route: string; moduleId: string }>
  environments: Array<{ id: string; name: string }>
  modules: Array<{ id: string; name: string; parentId: string | null }>
  onInlineLocatorSave?: (result: InlineLocatorSaveResult) => void
}

type StepInvocationResourceInputs = Omit<StepInvocationResources, 'onInlineLocatorSave'>

export function useStepInvocationResources({
  locators,
  locatorGroups,
  environments,
  modules,
}: StepInvocationResourceInputs): StepInvocationResources {
  const [inlineLocators, setInlineLocators] = useState<StepInvocationResources['locators']>([])
  const [inlineLocatorGroups, setInlineLocatorGroups] = useState<StepInvocationResources['locatorGroups']>([])
  const onInlineLocatorSave = useCallback((result: InlineLocatorSaveResult) => {
    const locator = { id: result.locatorId, name: result.locatorName, locatorGroupId: result.locatorGroupId }
    const locatorGroup = {
      id: result.locatorGroupId,
      name: result.locatorGroupName,
      route: result.route,
      moduleId: result.moduleId,
    }
    setInlineLocators(current => (current.some(item => item.id === locator.id) ? current : [...current, locator]))
    setInlineLocatorGroups(current =>
      current.some(item => item.id === locatorGroup.id) ? current : [...current, locatorGroup],
    )
  }, [])

  return useMemo(
    () => ({
      locators: [...locators, ...inlineLocators],
      locatorGroups: [...locatorGroups, ...inlineLocatorGroups],
      environments,
      modules,
      onInlineLocatorSave,
    }),
    [environments, inlineLocatorGroups, inlineLocators, locatorGroups, locators, modules, onInlineLocatorSave],
  )
}
