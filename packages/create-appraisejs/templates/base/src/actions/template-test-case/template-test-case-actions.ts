'use server'

import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import {
  createTemplateTestCase,
  deleteTemplateTestCases,
  getTemplateTestCaseByIdOrThrow,
  listTemplateTestCases,
  updateTemplateTestCase,
} from '@/services/template-test-case/template-test-case-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllTemplateTestCasesAction(): Promise<ActionResponse> {
  try {
    const templateTestCases = await listTemplateTestCases()
    return {
      status: 200,
      success: true,
      data: templateTestCases,
    }
  } catch (e) {
    return unknownErrorToActionResponse(e)
  }
}

export async function deleteTemplateTestCaseAction(id: string[]): Promise<ActionResponse> {
  try {
    await deleteTemplateTestCases(id)
    revalidatePath('/template-test-cases')
    return {
      status: 200,
      success: true,
      message: 'Template test case(s) deleted successfully',
    }
  } catch (e) {
    return unknownErrorToActionResponse(e)
  }
}

export async function createTemplateTestCaseAction(
  value: z.infer<typeof templateTestCaseSchema>,
): Promise<ActionResponse> {
  try {
    templateTestCaseSchema.parse(value)
    const newTemplateTestCase = await createTemplateTestCase(value)
    revalidatePath('/template-test-cases')
    return {
      status: 200,
      success: true,
      message: 'Template test case created successfully',
      data: newTemplateTestCase,
    }
  } catch (e) {
    if (e instanceof ServiceError) {
      return serviceErrorToActionResponse(e)
    }
    return unknownErrorToActionResponse(e)
  }
}

export async function getTemplateTestCaseByIdAction(id: string): Promise<ActionResponse> {
  try {
    const templateTestCase = await getTemplateTestCaseByIdOrThrow(id)
    return {
      status: 200,
      success: true,
      data: templateTestCase,
    }
  } catch (e) {
    if (e instanceof ServiceError) {
      return serviceErrorToActionResponse(e)
    }
    return unknownErrorToActionResponse(e)
  }
}

export async function updateTemplateTestCaseAction(
  value: z.infer<typeof templateTestCaseSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    templateTestCaseSchema.parse(value)
    const templateTestCase = await updateTemplateTestCase(id, value)
    revalidatePath('/template-test-cases')
    return {
      status: 200,
      success: true,
      message: 'Template test case updated successfully',
      data: templateTestCase,
    }
  } catch (e) {
    if (e instanceof ServiceError) {
      return serviceErrorToActionResponse(e)
    }
    return unknownErrorToActionResponse(e)
  }
}
