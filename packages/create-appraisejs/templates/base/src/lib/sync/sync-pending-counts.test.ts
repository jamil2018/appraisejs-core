import { describe, expect, it } from 'vitest'
import { StepParameterType, TagType, TemplateStepGroupType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import {
  countEnvironmentMismatches,
  countLocatorGroupMismatches,
  countModuleMismatches,
  countTagMismatches,
  countTemplateStepGroupMismatches,
  countTemplateStepMismatches,
  countTestSuiteMismatches,
  countTestCaseMismatches,
} from '@/lib/sync/sync-pending-counts'

describe('sync pending counts', () => {
  it('ignores DB-only modules when counting pending module sync work', () => {
    const count = countModuleMismatches(new Set(['/']), [
      { id: 'root', name: 'root', path: '/', parentId: null },
      { id: 'module-1', name: 'ui-only-module', path: '/ui-only-module', parentId: 'root' },
    ])

    expect(count).toBe(0)
  })

  it('counts environment value changes but not deletions the sync script skips', () => {
    const count = countEnvironmentMismatches(
      [
        {
          name: 'Local',
          baseUrl: 'http://localhost:3000',
          apiBaseUrl: null,
          username: 'demo@example.com',
          password: null,
        },
      ],
      [
        {
          name: 'Local',
          baseUrl: 'http://localhost:3001',
          apiBaseUrl: null,
          username: 'demo@example.com',
          password: null,
          _count: { testRuns: 0 },
        },
        {
          name: 'Historic',
          baseUrl: 'https://old.example.com',
          apiBaseUrl: null,
          username: null,
          password: null,
          _count: { testRuns: 2 },
        },
      ],
    )

    expect(count).toBe(1)
  })

  it('ignores DB-only standalone filter tags when filesystem tags are already satisfied', () => {
    const count = countTagMismatches(
      [{ name: 'smoke', tagExpression: '@smoke', type: TagType.FILTER }],
      [
        { name: 'smoke', type: TagType.FILTER },
        { name: 'standalone', type: TagType.FILTER },
      ],
    )

    expect(count).toBe(0)
  })

  it('treats projected template step groups as synchronized even with extra DB rows', () => {
    const count = countTemplateStepGroupMismatches(
      [{ name: 'Actions', description: 'Projected from UI', type: TemplateStepGroupType.ACTION }],
      [
        { name: 'Actions', description: 'Projected from UI', type: TemplateStepGroupType.ACTION },
        { name: 'Actions', description: 'stale row', type: TemplateStepGroupType.VALIDATION },
        { name: 'DB Only Group', description: null, type: TemplateStepGroupType.ACTION },
      ],
    )

    expect(count).toBe(0)
  })

  it('matches template steps against any equivalent DB row after function normalization', () => {
    const count = countTemplateStepMismatches(
      [
        {
          groupName: 'Actions',
          groupType: TemplateStepGroupType.ACTION,
          step: {
            jsdoc: {
              name: 'Click button',
              description: 'Clicks a button',
              icon: TemplateStepIcon.MOUSE,
            },
            signature: 'click {string}',
            functionDefinition: '',
            normalizedFunctionDefinition:
              "When('click {string}', async function (this: CustomWorld, button: string) {\n  await this.page.click(button);\n});",
            parameters: [{ name: 'button', order: 0, type: StepParameterType.STRING }],
            keyword: 'When',
          },
        },
      ],
      [
        {
          signature: 'click {string}',
          name: 'Click button',
          description: 'stale row',
          functionDefinition: "When('click {string}', async function () {});",
          icon: TemplateStepIcon.MOUSE,
          type: TemplateStepType.ACTION,
          templateStepGroup: { name: 'Actions' },
          parameters: [],
        },
        {
          signature: 'click {string}',
          name: 'Click button',
          description: 'Clicks a button',
          functionDefinition:
            "When('click {string}', async function (this: CustomWorld, button: string) {\n  await this.page.click(button);\n});",
          icon: TemplateStepIcon.MOUSE,
          type: TemplateStepType.ACTION,
          templateStepGroup: { name: 'Actions' },
          parameters: [{ name: 'button', order: 0, type: StepParameterType.STRING }],
        },
      ],
    )

    expect(count).toBe(0)
  })

  it('collapses duplicate filesystem template-step signatures to the script final state', () => {
    const count = countTemplateStepMismatches(
      [
        {
          groupName: 'Actions',
          groupType: TemplateStepGroupType.ACTION,
          step: {
            jsdoc: {
              name: 'Old duplicate',
              description: 'First parsed copy',
              icon: TemplateStepIcon.MOUSE,
            },
            signature: 'click {string}',
            functionDefinition: '',
            normalizedFunctionDefinition: "When('click {string}', async function () {});",
            parameters: [],
            keyword: 'When',
          },
        },
        {
          groupName: 'Actions',
          groupType: TemplateStepGroupType.ACTION,
          step: {
            jsdoc: {
              name: 'Click button',
              description: 'Final parsed copy',
              icon: TemplateStepIcon.MOUSE,
            },
            signature: 'click {string}',
            functionDefinition: '',
            normalizedFunctionDefinition: "When('click {string}', async function () {});",
            parameters: [],
            keyword: 'When',
          },
        },
      ],
      [
        {
          signature: 'click {string}',
          name: 'Click button',
          description: 'Final parsed copy',
          functionDefinition: "When('click {string}', async function () {});",
          icon: TemplateStepIcon.MOUSE,
          type: TemplateStepType.ACTION,
          templateStepGroup: { name: 'Actions' },
          parameters: [],
        },
      ],
    )

    expect(count).toBe(0)
  })

  it('matches test suites by generated filesystem key instead of raw DB name', () => {
    const count = countTestSuiteMismatches(
      [
        {
          name: 'user-login-suite',
          description: 'Projected suite',
          modulePath: '/auth',
          tags: ['@smoke'],
        },
      ],
      [
        {
          name: 'User Login Suite',
          description: 'Projected suite',
          moduleId: 'module-auth',
          tags: [{ tagExpression: '@smoke' }],
        },
      ],
      new Map([['module-auth', '/auth']]),
    )

    expect(count).toBe(0)
  })

  it('matches test suites when DB description is null and feature uses suite name', () => {
    const count = countTestSuiteMismatches(
      [
        {
          name: 'user-login-suite',
          description: 'User Login Suite',
          modulePath: '/auth',
          tags: [],
        },
      ],
      [
        {
          name: 'User Login Suite',
          description: null,
          moduleId: 'module-auth',
          tags: [],
        },
      ],
      new Map([['module-auth', '/auth']]),
    )

    expect(count).toBe(0)
  })

  it('collapses duplicate filesystem locator-group names to the script final state', () => {
    const count = countLocatorGroupMismatches(
      [
        {
          name: 'Login Page',
          route: '/first',
          modulePath: '/auth',
        },
        {
          name: 'Login Page',
          route: '/login',
          modulePath: '/auth',
        },
      ],
      [
        {
          name: 'Login Page',
          route: '/login',
          moduleId: 'module-auth',
        },
      ],
      new Map([['module-auth', '/auth']]),
    )

    expect(count).toBe(0)
  })

  it('collapses duplicate filesystem test-suite identities to the script final state', () => {
    const count = countTestSuiteMismatches(
      [
        {
          name: 'user-login-suite',
          description: 'First parsed copy',
          modulePath: '/auth',
          tags: ['@smoke'],
        },
        {
          name: 'user-login-suite',
          description: 'Final parsed copy',
          modulePath: '/auth',
          tags: ['@smoke', '@regression'],
        },
      ],
      [
        {
          name: 'User Login Suite',
          description: 'Final parsed copy',
          moduleId: 'module-auth',
          tags: [{ tagExpression: '@smoke' }, { tagExpression: '@regression' }],
        },
      ],
      new Map([['module-auth', '/auth']]),
    )

    expect(count).toBe(0)
  })

  it('matches projected test cases against generated feature-file output', () => {
    const count = countTestCaseMismatches(
      [
        {
          identifierTag: '@tc_login',
          title: 'Login',
          description: 'Opens the login screen',
          testSuiteName: 'user-login-suite',
          modulePath: '/auth',
          filterTags: ['@smoke'],
          nodes: [],
          flowBlocks: [],
          steps: [
            { order: 1, keyword: 'Given', text: 'open the login page' },
            { order: 2, keyword: 'Then', text: 'should see the dashboard' },
          ],
        },
      ],
      [
        {
          title: 'Login',
          description: 'Opens the login screen',
          tags: [
            { tagExpression: '@tc_login', type: TagType.IDENTIFIER },
            { tagExpression: '@smoke', type: TagType.FILTER },
          ],
          TestSuite: [{ name: 'User Login Suite', moduleId: 'module-auth' }],
          steps: [
            {
              order: 1,
              gherkinStep: 'When open the login page',
              flowNodeId: null,
              label: 'open the login page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the login page' },
              parameters: [],
            },
            {
              order: 2,
              gherkinStep: 'Then should see the dashboard',
              flowNodeId: null,
              label: 'should see the dashboard',
              icon: TemplateStepIcon.VALIDATION,
              TemplateStep: { signature: 'should see the dashboard' },
              parameters: [],
            },
          ],
          flowBlocks: [],
        },
      ],
      new Map([['module-auth', '/auth']]),
      [
        { signature: 'open the login page', parameters: [] },
        { signature: 'should see the dashboard', parameters: [] },
      ],
    )

    expect(count).toBe(0)
  })

  it('counts sidecar-backed node label and flow block mismatches', () => {
    const baseFilesystemCase = {
      identifierTag: '@tc_checkout',
      title: 'Checkout',
      description: 'Buys an item',
      testSuiteName: 'checkout-suite',
      modulePath: '/commerce',
      filterTags: [],
      steps: [{ order: 1, keyword: 'Given' as const, text: 'open checkout' }],
      hasAppraiseMetadata: true,
      nodes: [{ nodeId: 'node-open', order: 1, label: 'Open checkout' }],
      flowBlocks: [{ id: 'block-flow', name: 'Checkout flow', order: 0, nodeIds: ['node-open'] }],
    }

    const dbCase = {
      title: 'Checkout',
      description: 'Buys an item',
      tags: [{ tagExpression: '@tc_checkout', type: TagType.IDENTIFIER }],
      TestSuite: [{ name: 'Checkout Suite', moduleId: 'module-commerce' }],
      steps: [
        {
          order: 1,
          gherkinStep: 'When open checkout',
          flowNodeId: 'node-open',
          label: 'Old label',
          icon: TemplateStepIcon.MOUSE,
          TemplateStep: { signature: 'open checkout' },
          parameters: [],
        },
      ],
      flowBlocks: [
        {
          id: 'block-flow',
          name: 'Checkout flow',
          order: 0,
          nodes: [{ flowNodeId: 'node-other' }],
        },
      ],
    }

    const count = countTestCaseMismatches([baseFilesystemCase], [dbCase], new Map([['module-commerce', '/commerce']]), [
      { signature: 'open checkout', parameters: [] },
    ])

    expect(count).toBe(1)
  })

  it('ignores duplicate stale DB test cases when one matching identifier row exists', () => {
    const count = countTestCaseMismatches(
      [
        {
          identifierTag: '@tc_profile',
          title: 'Profile',
          description: 'Shows the profile page',
          testSuiteName: 'profile-suite',
          modulePath: '/account',
          filterTags: ['@regression'],
          nodes: [],
          flowBlocks: [],
          steps: [{ order: 1, keyword: 'Given', text: 'open the profile page' }],
        },
      ],
      [
        {
          title: 'Old Profile',
          description: 'stale',
          tags: [
            { tagExpression: '@tc_profile', type: TagType.IDENTIFIER },
            { tagExpression: '@regression', type: TagType.FILTER },
          ],
          TestSuite: [{ name: 'Other Suite', moduleId: 'module-account' }],
          steps: [
            {
              order: 1,
              gherkinStep: 'When open the wrong page',
              flowNodeId: null,
              label: 'open the wrong page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the wrong page' },
              parameters: [],
            },
          ],
          flowBlocks: [],
        },
        {
          title: 'Profile',
          description: 'Shows the profile page',
          tags: [
            { tagExpression: '@tc_profile', type: TagType.IDENTIFIER },
            { tagExpression: '@regression', type: TagType.FILTER },
          ],
          TestSuite: [{ name: 'Profile Suite', moduleId: 'module-account' }],
          steps: [
            {
              order: 1,
              gherkinStep: 'When open the profile page',
              flowNodeId: null,
              label: 'open the profile page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the profile page' },
              parameters: [],
            },
          ],
          flowBlocks: [],
        },
      ],
      new Map([['module-account', '/account']]),
      [{ signature: 'open the profile page', parameters: [] }],
    )

    expect(count).toBe(0)
  })

  it('treats And steps after Then as in sync when DB stores the feature-file keyword', () => {
    const count = countTestCaseMismatches(
      [
        {
          identifierTag: '@tc_route',
          title: 'Route Check',
          description: 'Validates route after login',
          testSuiteName: 'authentication',
          modulePath: '/E2E Auth',
          filterTags: [],
          nodes: [],
          flowBlocks: [],
          steps: [
            { order: 1, keyword: 'Given', text: 'open the login page' },
            { order: 2, keyword: 'Then', text: 'the url route should be equal to "/home"' },
            { order: 3, keyword: 'And', text: 'the page title should be "Home"' },
          ],
        },
      ],
      [
        {
          title: 'Route Check',
          description: 'Validates route after login',
          tags: [{ tagExpression: '@tc_route', type: TagType.IDENTIFIER }],
          TestSuite: [{ name: 'Authentication', moduleId: 'module-auth' }],
          steps: [
            {
              order: 1,
              gherkinStep: 'Given open the login page',
              flowNodeId: null,
              label: 'open the login page',
              icon: TemplateStepIcon.NAVIGATION,
              TemplateStep: { signature: 'open the login page' },
              parameters: [],
            },
            {
              order: 2,
              gherkinStep: 'Then the url route should be equal to "/home"',
              flowNodeId: null,
              label: 'the url route should be equal to "/home"',
              icon: TemplateStepIcon.VALIDATION,
              TemplateStep: { signature: 'the url route should be equal to {string}' },
              parameters: [{ name: 'route', value: '/home', order: 0, type: StepParameterType.STRING }],
            },
            {
              order: 3,
              gherkinStep: 'And the page title should be "Home"',
              flowNodeId: null,
              label: 'the page title should be "Home"',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'the page title should be {string}' },
              parameters: [{ name: 'title', value: 'Home', order: 0, type: StepParameterType.STRING }],
            },
          ],
          flowBlocks: [],
        },
      ],
      new Map([['module-auth', '/E2E Auth']]),
      [
        { signature: 'open the login page', parameters: [] },
        {
          signature: 'the url route should be equal to {string}',
          parameters: [{ name: 'route', order: 0, type: StepParameterType.STRING }],
        },
        {
          signature: 'the page title should be {string}',
          parameters: [{ name: 'title', order: 0, type: StepParameterType.STRING }],
        },
      ],
    )

    expect(count).toBe(0)
  })

  it('collapses duplicate filesystem test-case identifiers to the script final state', () => {
    const count = countTestCaseMismatches(
      [
        {
          identifierTag: '@tc_login',
          title: 'Login',
          description: 'Runs the login flow',
          testSuiteName: 'login-smoke',
          modulePath: '/auth',
          filterTags: ['@demo'],
          nodes: [],
          flowBlocks: [],
          steps: [{ order: 1, keyword: 'Given', text: 'open the login page' }],
        },
        {
          identifierTag: '@tc_login',
          title: 'Login',
          description: 'Runs the login flow',
          testSuiteName: 'login-regression',
          modulePath: '/auth',
          filterTags: ['@auth', '@demo'],
          nodes: [],
          flowBlocks: [],
          steps: [{ order: 1, keyword: 'Given', text: 'open the login page' }],
        },
      ],
      [
        {
          title: 'Login',
          description: 'Runs the login flow',
          tags: [
            { tagExpression: '@tc_login', type: TagType.IDENTIFIER },
            { tagExpression: '@auth', type: TagType.FILTER },
            { tagExpression: '@demo', type: TagType.FILTER },
          ],
          TestSuite: [
            { name: 'Login Smoke', moduleId: 'module-auth' },
            { name: 'Login Regression', moduleId: 'module-auth' },
          ],
          steps: [
            {
              order: 1,
              gherkinStep: 'Given open the login page',
              flowNodeId: null,
              label: 'open the login page',
              icon: TemplateStepIcon.NAVIGATION,
              TemplateStep: { signature: 'open the login page' },
              parameters: [],
            },
          ],
          flowBlocks: [],
        },
      ],
      new Map([['module-auth', '/auth']]),
      [{ signature: 'open the login page', parameters: [] }],
    )

    expect(count).toBe(0)
  })
})
