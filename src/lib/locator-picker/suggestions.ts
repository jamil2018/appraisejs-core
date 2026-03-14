import type { LocatorPickerGroupSuggestion, PickedLocatorPayload } from '@/types/locator-picker'
import type { LocatorGroup, Module } from '@prisma/client'

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function humanizeSegment(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase())
}

export function normalizeRoute(value: string | null | undefined): string {
  if (!value || value.trim() === '') {
    return '/'
  }

  try {
    const parsed = new URL(value)
    return parsed.pathname || '/'
  } catch {
    const route = value.trim()
    if (route === '') {
      return '/'
    }

    return route.startsWith('/') ? route : `/${route}`
  }
}

function buildModulePathMap(modules: Module[]): Map<string, string> {
  const moduleById = new Map(modules.map(module => [module.id, module]))
  const pathByModuleId = new Map<string, string>()

  const buildPath = (module: Module): string => {
    const cached = pathByModuleId.get(module.id)
    if (cached) {
      return cached
    }

    const parent = module.parentId ? moduleById.get(module.parentId) : null
    const pathValue = parent ? `${buildPath(parent)}/${module.name}` : `/${module.name}`

    pathByModuleId.set(module.id, pathValue.replace(/\/{2,}/g, '/'))
    return pathByModuleId.get(module.id)!
  }

  for (const module of modules) {
    buildPath(module)
  }

  return pathByModuleId
}

export function suggestLocatorName(payload?: PickedLocatorPayload): string {
  if (!payload) {
    return ''
  }

  const candidates = [payload.accessibleName, payload.text]

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (normalized) {
      return normalized.slice(0, 80)
    }
  }

  return humanizeSegment(payload.tagName || 'element')
}

export function inferGroupSuggestion(
  routeValue: string,
  pageTitle: string,
  locatorGroups: LocatorGroup[],
  modules: Module[],
): LocatorPickerGroupSuggestion {
  const route = normalizeRoute(routeValue)
  const exactMatch = locatorGroups.find(group => normalizeRoute(group.route) === route)

  if (exactMatch) {
    return {
      mode: 'existing',
      route,
      existingLocatorGroupId: exactMatch.id,
      existingLocatorGroupName: exactMatch.name,
      suggestedGroupName: exactMatch.name,
      suggestedModuleId: exactMatch.moduleId,
      requiresModuleSelection: false,
    }
  }

  const pathSegments = route.split('/').filter(Boolean)
  const baseName =
    normalizeText(pageTitle) ||
    (pathSegments.length > 0 ? humanizeSegment(pathSegments[pathSegments.length - 1]) : 'Home')

  const existingNames = new Set(locatorGroups.map(group => group.name.toLowerCase()))
  let suggestedGroupName = baseName
  let suffix = 2

  while (existingNames.has(suggestedGroupName.toLowerCase())) {
    suggestedGroupName = `${baseName} ${suffix}`
    suffix += 1
  }

  const modulePathMap = buildModulePathMap(modules)
  const matchedModule = Array.from(modulePathMap.entries())
    .map(([moduleId, modulePath]) => ({ moduleId, modulePath }))
    .sort((left, right) => right.modulePath.length - left.modulePath.length)
    .find(({ modulePath }) => route === modulePath || route.startsWith(`${modulePath}/`))

  return {
    mode: 'create',
    route,
    suggestedGroupName,
    suggestedModuleId: matchedModule?.moduleId,
    suggestedModulePath: matchedModule?.modulePath,
    requiresModuleSelection: !matchedModule?.moduleId,
  }
}
