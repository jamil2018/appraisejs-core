import { describe, expect, it } from 'vitest'
import {
  StepParameterType,
  TagType,
  TemplateStepGroupType,
  TemplateStepIcon,
  TemplateStepType,
} from '@prisma/client'
import {
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
              label: 'open the login page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the login page' },
              parameters: [],
            },
            {
              order: 2,
              gherkinStep: 'Then should see the dashboard',
              label: 'should see the dashboard',
              icon: TemplateStepIcon.VALIDATION,
              TemplateStep: { signature: 'should see the dashboard' },
              parameters: [],
            },
          ],
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
              label: 'open the wrong page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the wrong page' },
              parameters: [],
            },
          ],
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
              label: 'open the profile page',
              icon: TemplateStepIcon.MOUSE,
              TemplateStep: { signature: 'open the profile page' },
              parameters: [],
            },
          ],
        },
      ],
      new Map([['module-account', '/account']]),
      [{ signature: 'open the profile page', parameters: [] }],
    )

    expect(count).toBe(0)
  })
})
