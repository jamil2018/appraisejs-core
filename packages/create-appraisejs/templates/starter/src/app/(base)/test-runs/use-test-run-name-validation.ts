'use client'

import { useCallback, useEffect, useRef } from 'react'

import { checkTestRunNameUniqueAction } from '@/actions/test-run/test-run-actions'

type NameValidationResult = {
  isValid: boolean
  error?: string
}

export function useTestRunNameValidation(id?: string) {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkNameUniqueness = useCallback(
    async (name: string): Promise<NameValidationResult> => {
      if (!name) {
        return { isValid: true }
      }

      try {
        const response = await checkTestRunNameUniqueAction(name, id)

        if (response.status !== 200) {
          return { isValid: true }
        }

        const isUnique =
          typeof response.data === 'object' &&
          response.data !== null &&
          'isUnique' in response.data &&
          typeof response.data.isUnique === 'boolean'
            ? response.data.isUnique
            : true

        return isUnique
          ? { isValid: true }
          : {
              isValid: false,
              error: 'A test run with this name already exists. Please choose a different name.',
            }
      } catch {
        return { isValid: true }
      }
    },
    [id],
  )

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  const debouncedNameValidation = useCallback(
    (name: string): Promise<NameValidationResult> =>
      new Promise(resolve => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current)
        }

        debounceTimeoutRef.current = setTimeout(async () => {
          resolve(await checkNameUniqueness(name))
        }, 500)
      }),
    [checkNameUniqueness],
  )

  return {
    debouncedNameValidation,
  }
}
