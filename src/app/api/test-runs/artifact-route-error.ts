import { NextResponse } from 'next/server'
import { ServiceError } from '@/services/shared/errors'

export function opaqueArtifactError(error: unknown) {
  const status =
    error instanceof ServiceError && error.statusCode === 404
      ? 404
      : error instanceof ServiceError && error.statusCode === 409
        ? 409
        : 500
  return NextResponse.json(
    {
      error:
        status === 404
          ? 'Artifact not found.'
          : status === 409
            ? 'Artifact integrity conflict.'
            : 'Artifact request failed.',
    },
    { status },
  )
}
