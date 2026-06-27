import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(__dirname, '..')

export const TEMPLATE_IDS = ['starter', 'blank'] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

export interface TemplateDefinition {
  id: TemplateId
  flavorDirectory: 'starter' | 'blank'
  promptLabel: string
  promptDescription: string
}

export const DEFAULT_TEMPLATE_ID: TemplateId = 'starter'

const TEMPLATE_CATALOG: Record<TemplateId, TemplateDefinition> = {
  starter: {
    id: 'starter',
    flavorDirectory: 'starter',
    promptLabel: 'starter',
    promptDescription: 'Opinionated scaffold with bundled core template steps.',
  },
  blank: {
    id: 'blank',
    flavorDirectory: 'blank',
    promptLabel: 'blank',
    promptDescription: 'Same scaffold without bundled template steps.',
  },
}

export function getTemplateDefinition(template: TemplateId): TemplateDefinition {
  return TEMPLATE_CATALOG[template]
}

export function getTemplateDefinitions(): TemplateDefinition[] {
  return TEMPLATE_IDS.map(template => getTemplateDefinition(template))
}

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_IDS.includes(value as TemplateId)
}

export function parseTemplateId(value: string): TemplateId | null {
  const normalized = value.trim().toLowerCase()
  return isTemplateId(normalized) ? normalized : null
}

export function getTemplateChoices(): Array<{
  name: string
  value: TemplateId
  description: string
}> {
  return getTemplateDefinitions().map(template => ({
    name: template.promptLabel,
    value: template.id,
    description: template.promptDescription,
  }))
}

export function resolveBundledTemplatePath(template: TemplateId): string {
  return resolveBundledFlavorPath(template)
}

export function resolveBundledBaseTemplatePath(): string {
  return path.join(packageDir, 'templates', 'base')
}

export function resolveBundledFlavorPath(template: TemplateId): string {
  return path.join(packageDir, 'templates', 'flavors', getTemplateDefinition(template).flavorDirectory)
}

export function formatTemplateList(): string {
  return TEMPLATE_IDS.join(', ')
}
