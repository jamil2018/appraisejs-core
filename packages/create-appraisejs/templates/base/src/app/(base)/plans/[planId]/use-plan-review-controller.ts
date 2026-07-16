'use client'

import { useCallback, useState, useTransition } from 'react'

export type PlanReviewActionMessage = {
  tone: 'success' | 'error'
  text: string
  recovery?: 'validation-drift'
}

type CommandResult = { success?: boolean; error?: string }

function validationRecovery(result: CommandResult, requested?: PlanReviewActionMessage['recovery']) {
  if (result.success || requested !== 'validation-drift') return undefined
  return result.error?.includes('Validation files changed after approval or baseline execution') ? requested : undefined
}

function commandMessage(
  result: CommandResult,
  successMessage: string,
  requestedRecovery?: PlanReviewActionMessage['recovery'],
): PlanReviewActionMessage {
  return {
    tone: result.success ? 'success' : 'error',
    text: result.success ? successMessage : (result.error ?? 'The action failed.'),
    recovery: validationRecovery(result, requestedRecovery),
  }
}

async function executeCommand(
  operation: () => Promise<CommandResult>,
  successMessage: string,
  requestedRecovery?: PlanReviewActionMessage['recovery'],
) {
  try {
    const result = await operation()
    return { message: commandMessage(result, successMessage, requestedRecovery), refresh: Boolean(result.success) }
  } catch (error) {
    return {
      message: {
        tone: 'error' as const,
        text: error instanceof Error ? error.message : 'The action failed.',
      },
      refresh: false,
    }
  }
}

export function usePlanReviewController(refresh: () => void) {
  const [message, setMessage] = useState<PlanReviewActionMessage | null>(null)
  const [isPending, startTransition] = useTransition()

  const runCommand = useCallback(
    (
      operation: () => Promise<CommandResult>,
      successMessage: string,
      options?: { recovery?: PlanReviewActionMessage['recovery'] },
    ) => {
      setMessage(null)
      startTransition(async () => {
        const result = await executeCommand(operation, successMessage, options?.recovery)
        setMessage(result.message)
        if (result.refresh) refresh()
      })
    },
    [refresh],
  )

  return { isPending, message, runCommand }
}
