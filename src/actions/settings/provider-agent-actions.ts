'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { providerActionErrorResponse } from '@/actions/shared/provider-action-error'
import { isProviderNativeRunsEnabled } from '@/lib/feature-flags'
import {
  probeProviderRegistration,
  updateProviderRegistration,
} from '@/services/coordinator/coordinator-provider-run-service'
import { ServiceError } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const providerKeySchema = z.object({ providerKey: z.string().trim().min(1) })

const updateProviderSchema = providerKeySchema.extend({
  executablePath: z.string().trim().optional(),
  defaultProfile: z.string().trim().optional(),
  defaultModel: z.string().trim().optional(),
  enabled: z.boolean().optional(),
  launchEnabled: z.boolean().optional(),
})

function revalidateProviderPaths() {
  revalidatePath('/settings')
  revalidatePath('/provider-runs')
}

function assertProviderNativeRunsEnabled() {
  if (!isProviderNativeRunsEnabled()) {
    throw new ServiceError(
      'Provider-native runs are experimental and disabled. Start planning from your coding agent through Appraise MCP instead.',
      'VALIDATION',
      400,
    )
  }
}

export async function probeProviderAction(input: unknown): Promise<ActionResponse> {
  try {
    assertProviderNativeRunsEnabled()
    const { providerKey } = providerKeySchema.parse(input)
    const registration = await probeProviderRegistration(providerKey)
    revalidateProviderPaths()
    return {
      status: 200,
      success: true,
      data: { providerKey: registration.key, probeStatus: registration.probeStatus },
    }
  } catch (error) {
    return providerActionErrorResponse(error, 'Provider probe failed')
  }
}

export async function updateProviderAction(input: unknown): Promise<ActionResponse> {
  try {
    assertProviderNativeRunsEnabled()
    const value = updateProviderSchema.parse(input)
    const registration = await updateProviderRegistration({
      ...value,
      executablePath: value.executablePath || null,
      defaultProfile: value.defaultProfile || null,
      defaultModel: value.defaultModel || null,
    })
    revalidateProviderPaths()
    return { status: 200, success: true, data: { providerKey: registration.key } }
  } catch (error) {
    return providerActionErrorResponse(error, 'Provider update failed')
  }
}
