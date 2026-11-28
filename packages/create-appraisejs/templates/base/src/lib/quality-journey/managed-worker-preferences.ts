import { z } from 'zod'

export const managedWorkerEfforts = ['low', 'medium', 'high'] as const
export type ManagedWorkerEffort = (typeof managedWorkerEfforts)[number]
export const managedWorkerEffortSchema = z.enum(managedWorkerEfforts)

export const managedWorkerOptions = {
  CODEX: [{ value: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' }],
  CLAUDE_CODE: [
    { value: 'haiku', label: 'Claude Haiku' },
    { value: 'sonnet', label: 'Claude Sonnet' },
    { value: 'opus', label: 'Claude Opus' },
  ],
} as const
export type ManagedWorkerProvider = keyof typeof managedWorkerOptions
export type ManagedWorkerModel = (typeof managedWorkerOptions)[ManagedWorkerProvider][number]['value']
export const managedWorkerModelSchema = z.enum(['gpt-6.1-sol', 'haiku', 'sonnet', 'opus'])
export const defaultManagedWorkerModel = { CODEX: 'gpt-6.1-sol', CLAUDE_CODE: undefined } as const

export type ManagedWorkerPreferences = {
  managedWorkerModel?: ManagedWorkerModel | null
  managedWorkerEffort?: ManagedWorkerEffort | null
}

/** Validate choices before a draft, Journey, or provider dispatch can commit them. */
export function parseManagedWorkerPreferences(
  provider: ManagedWorkerProvider,
  input: { managedWorkerModel?: unknown; managedWorkerEffort?: unknown },
) {
  const model = input.managedWorkerModel == null ? undefined : managedWorkerModelSchema.parse(input.managedWorkerModel)
  const effort =
    input.managedWorkerEffort == null ? undefined : managedWorkerEffortSchema.parse(input.managedWorkerEffort)
  if (model && !managedWorkerOptions[provider].some(option => option.value === model))
    throw new Error('The selected model is unavailable for this provider.')
  return { managedWorkerModel: model, managedWorkerEffort: effort }
}
