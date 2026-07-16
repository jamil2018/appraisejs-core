import { describe, expect, it } from 'vitest'

import { projectEnvironmentConfig } from './environment-file-utils'

describe('environment automation projection', () => {
  it('projects only credential reference metadata even when the referenced secret exists', () => {
    const reference = 'APPRAISE_SECRET_SENTINEL'
    process.env[reference] = 'known-fixture-secret-sentinel'
    try {
      const projection = projectEnvironmentConfig({
        baseUrl: 'https://example.test',
        apiBaseUrl: null,
        username: 'tester',
        passwordEnvironmentVariable: reference,
      })

      expect(projection.passwordEnvironmentVariable).toBe(reference)
      expect(JSON.stringify(projection)).not.toContain(process.env[reference])
      expect(projection).not.toHaveProperty('password')
    } finally {
      delete process.env[reference]
    }
  })
})
