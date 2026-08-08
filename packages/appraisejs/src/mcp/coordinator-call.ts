import {
  CoordinatorRequestError,
  createCoordinatorClient,
  coordinatorRequestError,
  type CoordinatorOptions,
} from '../coordinator-client.js'

export { CoordinatorRequestError }

export async function createCoordinatorApiClient(options: CoordinatorOptions) {
  return createCoordinatorClient(options)
}

export function toolError(error: unknown) {
  if (!(error instanceof CoordinatorRequestError)) throw error
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(coordinatorRequestError(error)),
      },
    ],
  }
}
