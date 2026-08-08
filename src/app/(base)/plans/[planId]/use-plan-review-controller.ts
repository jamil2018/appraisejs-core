'use client'

import { useCallback, useState, useTransition } from 'react'

import {
  coordinatorAcknowledgementSchema,
  coordinatorErrorEnvelopeSchema,
  type CoordinatorErrorEnvelope,
} from '@/services/shared/errors'

export type PlanReviewActionMessage = {
  tone: 'success' | 'error'
  text: string
  recovery?: 'validation-drift'
}

type CommandResult = unknown

function validationRecovery(error: CoordinatorErrorEnvelope, requested?: PlanReviewActionMessage['recovery']) {
  return requested === 'validation-drift' && error.code === 'validation_artifact_changed' ? requested : undefined
}

function commandMessage(
  result: CommandResult,
  successMessage: string,
  requestedRecovery?: PlanReviewActionMessage['recovery'],
): PlanReviewActionMessage {
  if (coordinatorAcknowledgementSchema.safeParse(result).success) return { tone: 'success', text: successMessage }
  const error = coordinatorErrorEnvelopeSchema.safeParse(result)
  if (!error.success) return { tone: 'error', text: 'The action returned an invalid Appraise response.' }
  return {
    tone: 'error',
    text: error.data.message,
    recovery: validationRecovery(error.data, requestedRecovery),
  }
}

async function executeCommand(
  operation: () => Promise<CommandResult>,
  successMessage: string,
  requestedRecovery?: PlanReviewActionMessage['recovery'],
) {
  try {
    const result = await operation()
    return {
      message: commandMessage(result, successMessage, requestedRecovery),
      refresh: coordinatorAcknowledgementSchema.safeParse(result).success,
    }
  } catch {
    return {
      message: {
        tone: 'error' as const,
        text: 'The action could not be completed.',
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
