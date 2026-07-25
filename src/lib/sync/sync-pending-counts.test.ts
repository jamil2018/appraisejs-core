import { describe, expect, it } from 'vitest'
import { TagType, TemplateStepIcon } from '@prisma/client'

import {
  countEnvironmentMismatches,
  countLocatorGroupMismatches,
  countModuleMismatches,
  countTagMismatches,
  countTestCaseMismatches,
  countTestSuiteMismatches,
} from '@/lib/sync/sync-pending-counts'
import { canonicalStepDefinitionJson } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

describe('sync pending counts', () => {
  it('ignores DB-only modules when filesystem modules are synchronized', () => {
    expect(
      countModuleMismatches(new Set(['/']), [
        { id: 'root', name: 'root', path: '/', parentId: null },
        { id: 'module-1', name: 'ui-only-module', path: '/ui-only-module', parentId: 'root' },
      ]),
    ).toBe(0)
  })

  it('counts changed environment values but not protected DB-only rows', () => {
    expect(
      countEnvironmentMismatches(
        [
          {
            name: 'Local',
            baseUrl: 'http://localhost:3000',
            apiBaseUrl: null,
            username: null,
            passwordEnvironmentVariable: null,
          },
        ],
        [
          {
            name: 'Local',
            baseUrl: 'http://localhost:3001',
            apiBaseUrl: null,
            username: null,
            passwordEnvironmentVariable: null,
            _count: { testRuns: 0 },
          },
        ],
      ),
    ).toBe(1)
  })

  it('matches filesystem tags without treating DB-only filter tags as pending work', () => {
    expect(
      countTagMismatches(
        [{ name: 'smoke', tagExpression: '@smoke', type: TagType.FILTER }],
        [
          { name: 'smoke', type: TagType.FILTER },
          { name: 'standalone', type: TagType.FILTER },
        ],
      ),
    ).toBe(0)
  })

  it('matches test suites by normalized filename and module path', () => {
    expect(
      countTestSuiteMismatches(
        [{ name: 'Login Smoke', description: 'Login Smoke', modulePath: '/auth', tags: [] }],
        [{ name: 'Login Smoke', description: 'Login Smoke', moduleId: 'module-auth', tags: [] }],
        new Map([['module-auth', '/auth']]),
      ),
    ).toBe(0)
  })

  it('requires exact metadata-backed Step Invocation content for test-case sync', () => {
    const invocation = {
      step: { id: 'browser.open-url', version: '1', definitionHash: 'sha256:abc' },
      inputs: { url: 'https://example.test' },
    }
    const filesystemCase = {
      identifierTag: '@tc_login',
      title: 'Login',
      description: 'Opens the app',
      testSuiteName: 'login-smoke',
      modulePath: '/auth',
      filterTags: [],
      hasAppraiseMetadata: true,
      nodes: [{ nodeId: 'node-open', order: 1, label: 'Open app', invocation }],
      flowBlocks: [],
      steps: [{ order: 1, keyword: 'Given', text: 'open the app' }],
    }
    const dbCase = {
      title: 'Login',
      description: 'Opens the app',
      tags: [{ tagExpression: '@tc_login', type: TagType.IDENTIFIER }],
      TestSuite: [{ name: 'Login Smoke', moduleId: 'module-auth' }],
      steps: [
        {
          order: 1,
          gherkinStep: 'Given open the app',
          flowNodeId: 'node-open',
          label: 'Open app',
          icon: TemplateStepIcon.NAVIGATION,
          invocationJson: canonicalStepDefinitionJson(invocation),
          parameters: [],
        },
      ],
      flowBlocks: [],
    }

    expect(countTestCaseMismatches([filesystemCase], [dbCase], new Map([['module-auth', '/auth']]))).toBe(0)
    expect(
      countTestCaseMismatches(
        [filesystemCase],
        [
          {
            ...dbCase,
            steps: [{ ...dbCase.steps[0], invocationJson: canonicalStepDefinitionJson({ ...invocation, inputs: {} }) }],
          },
        ],
        new Map([['module-auth', '/auth']]),
      ),
    ).toBe(1)
  })

  it('compares locator groups by route and module path', () => {
    expect(
      countLocatorGroupMismatches(
        [{ name: 'Account', route: '/account', modulePath: '/auth' }],
        [{ name: 'Account', route: '/account', moduleId: 'module-auth' }],
        new Map([['module-auth', '/auth']]),
      ),
    ).toBe(0)
  })
})
