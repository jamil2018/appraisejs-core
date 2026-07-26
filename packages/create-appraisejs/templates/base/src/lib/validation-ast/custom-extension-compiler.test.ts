import { describe, expect, it } from 'vitest'
import { compileCustomExtension, CustomExtensionCompilationError } from './custom-extension-compiler'
import { createCustomExtensionPolicy } from './extension-policy'
import { VALIDATION_AST_LIMITS } from './schemas'
import type { CustomActionExtensionProposal } from './schemas'

const proposal = (source: string, capabilities = ['browser']): CustomActionExtensionProposal => ({
  schemaVersion: 2,
  id: 'observe-breathing',
  version: '1.0.0',
  title: 'Observe breathing',
  description: 'Checks a project-specific breathing animation.',
  reasonExistingActionsAreInsufficient: 'The animation state has no registered action.',
  inputs: [{ name: 'duration', type: 'number', required: true }],
  outputs: [{ name: 'observed', type: 'boolean' }],
  requiredCapabilities: capabilities,
  implementation: { language: 'typescript', source },
})

const policy = {
  policy: createCustomExtensionPolicy({
    projectId: 'project-123',
    projectFingerprint: `sha256:${'a'.repeat(64)}`,
    capabilityImports: { browser: ['@playwright/test'] },
  }),
  cucumberModulePath: '/appraise/node_modules/@cucumber/cucumber/lib/index.js',
}

describe('compileCustomExtension', () => {
  it('compiles a project-scoped exact review and binds the Appraise Cucumber instance', () => {
    const result = compileCustomExtension(
      proposal("import { Then } from '@cucumber/cucumber'\nThen('breathing is visible', function () {})"),
      policy,
    )
    expect(result).toMatchObject({
      projectId: 'project-123',
      projectFingerprint: `sha256:${'a'.repeat(64)}`,
      requiredCapabilities: ['browser'],
      imports: [
        { requested: '@cucumber/cucumber', compiled: '/appraise/node_modules/@cucumber/cucumber/lib/index.js' },
      ],
      cucumberModulePath: '/appraise/node_modules/@cucumber/cucumber/lib/index.js',
    })
    expect(result.compiledSource).toContain('/appraise/node_modules/@cucumber/cucumber/lib/index.js')
    expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(result.compiledHash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('allows only imports granted by declared project capabilities', () => {
    const result = compileCustomExtension(
      proposal("import { expect } from '@playwright/test'\nexport const assertion = expect"),
      policy,
    )
    expect(result.imports).toEqual([{ requested: '@playwright/test', compiled: '@playwright/test' }])
    expect(() => compileCustomExtension(proposal("import fs from 'node:fs'"), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(['Import "node:fs" is not allowed by the declared capabilities.']),
      }),
    )
  })

  it('rejects unknown capabilities and runtime-loaded modules', () => {
    expect(() => compileCustomExtension(proposal('export const value = 1', ['filesystem']), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: ['Capability "filesystem" is not allowed for this project.'],
      }),
    )
    expect(() => compileCustomExtension(proposal("const module = import('node:fs')"), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(['Dynamic imports are not allowed.']),
      }),
    )
  })

  it('rejects dangerous globals and type errors against the explicit declaration surface', () => {
    expect(() => compileCustomExtension(proposal("process.env.SECRET = 'value'"), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(['Global "process" is not allowed.']),
      }),
    )
    expect(() => compileCustomExtension(proposal('const value: number = "wrong"'), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(["Type 'string' is not assignable to type 'number'."]),
      }),
    )
    expect(() => compileCustomExtension(proposal("fetch('https://example.com')"), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(['Global "fetch" is not allowed.']),
      }),
    )
    expect(() => compileCustomExtension(proposal('export const url = import.meta.url'), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: expect.arrayContaining(['import.meta is not allowed.']),
      }),
    )
  })

  it('rejects module re-exports and oversized source before module resolution', () => {
    expect(() => compileCustomExtension(proposal("export { Then } from '@cucumber/cucumber'"), policy)).toThrowError(
      expect.objectContaining<Partial<CustomExtensionCompilationError>>({
        issues: ['Module re-exports are not allowed.'],
      }),
    )
    expect(() =>
      compileCustomExtension(
        proposal(`import '/private/secret.ts'\n${'x'.repeat(VALIDATION_AST_LIMITS.sourceBytes)}`),
        policy,
      ),
    ).toThrowError(/Source is too large/)
  })
})
