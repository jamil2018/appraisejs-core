import type { ActionResponse } from '@/types/form/actionHandler'
import { NextResponse } from 'next/server'

export function stepDefinitionResponse(response: ActionResponse) {
  return NextResponse.json(response, { status: response.status })
}

export async function readStepDefinitionBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
