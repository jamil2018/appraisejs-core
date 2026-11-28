import { describe, expect, it } from 'vitest'

import {
  isAnalysisApprovalRequest,
  isRunPermissionApprovalRequest,
  parseAnalysisAnswerReply,
  parseAttachedCaseRename,
  parseAttachedCaseSuiteAdd,
  parseExactEnvironmentCreate,
  parseExactSuiteCreate,
  parseExactSuiteRename,
  parseExactTagCreate,
  parseExactTagRename,
  parseRootModuleCreate,
  parseWorkspaceRequest,
} from './workspace-request'

describe('workspace requests', () => {
  it.each([
    ['Find the case named “Guest checkout”', { kind: 'TEST_CASE', query: 'Guest checkout' }],
    ['List recent test runs', { kind: 'TEST_RUN', query: '' }],
    ['Please show me templates matching Login', { kind: 'CASE_TEMPLATE', query: 'Login' }],
    ['Look up reports about Checkout?', { kind: 'REPORT', query: 'Checkout' }],
  ])('parses %s', (message, expected) => {
    expect(parseWorkspaceRequest(message)).toEqual(expected)
  })

  it('does not route an unrecognized or overlong request to a record read', () => {
    expect(parseWorkspaceRequest('Delete the guest checkout case')).toBeUndefined()
    expect(parseWorkspaceRequest('Find case ' + 'x'.repeat(161))).toBeUndefined()
  })

  it('only recognizes a rename addressed to the attached case', () => {
    expect(parseAttachedCaseRename('Please rename this test case to “Express checkout”')).toBe('Express checkout')
    expect(parseAttachedCaseRename('Rename the attached case to "Express checkout"')).toBe('Express checkout')
    expect(parseAttachedCaseRename('Rename case Checkout to express checkout')).toBeUndefined()
  })

  it('only recognizes one quoted suite and module for the attached case', () => {
    expect(parseAttachedCaseSuiteAdd('Add this case to suite “Checkout smoke” in module “Checkout”')).toEqual({
      suiteName: 'Checkout smoke',
      moduleName: 'Checkout',
    })
    expect(
      parseAttachedCaseSuiteAdd('Please add the attached test case to test suite "Guest smoke" in module "Store"'),
    ).toEqual({
      suiteName: 'Guest smoke',
      moduleName: 'Store',
    })
    for (const text of [
      'Add checkout case to suite “Checkout smoke” in module “Checkout”',
      'Add this case to suite Checkout smoke in module Checkout',
      'Add this case to suite “Checkout smoke” in module “Checkout” and run it',
      'Add this case to suite “Checkout smoke” in module “Checkout”?',
    ])
      expect(parseAttachedCaseSuiteAdd(text)).toBeUndefined()
  })

  it('requires exact old and new suite names in one quoted module', () => {
    expect(parseExactSuiteRename('Rename test suite “Checkout smoke” in module “Checkout” to “Guest smoke”')).toEqual({
      currentName: 'Checkout smoke',
      moduleName: 'Checkout',
      nextName: 'Guest smoke',
    })
    for (const text of [
      'Rename test suite Checkout smoke to Guest smoke',
      'Rename test suite “Checkout smoke” in module “Checkout” to “Checkout smoke”',
      'Rename test suite “Checkout smoke” in module “Checkout” to “Guest smoke” and run it',
    ])
      expect(parseExactSuiteRename(text)).toBeUndefined()
  })

  it('requires exact old tag name and expression for a filter-tag rename', () => {
    expect(parseExactTagRename('Rename tag “Smoke” with expression @smoke to “Release smoke”')).toEqual({
      currentName: 'Smoke',
      tagExpression: '@smoke',
      nextName: 'Release smoke',
    })
    for (const text of [
      'Rename tag Smoke to Release smoke',
      'Rename tag “Smoke” with expression @smoke to “Smoke”',
      'Rename tag “Smoke” with expression @smoke to “Release smoke” and run it',
    ])
      expect(parseExactTagRename(text)).toBeUndefined()
  })

  it('recognizes a single named root module request without guessing from broader prose', () => {
    expect(parseRootModuleCreate('Add a checkout module')).toBe('checkout')
    expect(parseRootModuleCreate('Create a module named Checkout')).toBe('Checkout')
    expect(parseRootModuleCreate('Please create a module named “Guest Checkout”')).toBe('Guest Checkout')
    expect(parseRootModuleCreate('Create a module named “Orders and payments”')).toBe('Orders and payments')
    for (const content of [
      'Add a module',
      'Add a checkout module under Payments',
      'Create a module named Checkout under Payments',
      'Create a module named Checkout only after I approve',
      'Add a test case to the checkout module',
      'Create a module named Checkout and run tests',
      'Create a module named Checkout?',
      'Can you add a checkout module?',
      'Create a module named ' + 'x'.repeat(161),
    ])
      expect(parseRootModuleCreate(content)).toBeUndefined()
  })

  it('requires an exact tag name and expression for a single create', () => {
    expect(parseExactTagCreate('Create a tag named Smoke with expression @smoke')).toEqual({
      name: 'Smoke',
      tagExpression: '@smoke',
    })
    expect(parseExactTagCreate('Please add a tag named “Release smoke” with expression @release-smoke')).toEqual({
      name: 'Release smoke',
      tagExpression: '@release-smoke',
    })
    for (const content of [
      'Add a smoke tag',
      'Create a tag named Smoke',
      'Create a tag named Smoke with expression smoke',
      'Create a tag named Smoke with expression @smoke and run tests',
      'Create a tag named Smoke with expression @smoke?',
      'Create a tag named ' + 'x'.repeat(161) + ' with expression @long',
    ])
      expect(parseExactTagCreate(content)).toBeUndefined()
  })

  it('requires an exact environment name and uncredentialed HTTP(S) base URL', () => {
    expect(
      parseExactEnvironmentCreate('Create an environment named Staging with base URL https://staging.example.test'),
    ).toEqual({
      name: 'Staging',
      baseUrl: 'https://staging.example.test',
    })
    expect(
      parseExactEnvironmentCreate(
        'Please add an environment named “Local checkout” with base URL http://localhost:4173',
      ),
    ).toEqual({
      name: 'Local checkout',
      baseUrl: 'http://localhost:4173',
    })
    for (const content of [
      'Add a staging environment',
      'Create an environment named Staging',
      'Create an environment named Staging with base URL ftp://example.test',
      'Create an environment named Staging with base URL https://user:secret@example.test',
      'Create an environment named Staging with base URL https://example.test?token=secret',
      'Create an environment named Staging with base URL https://example.test and run tests',
      'Create an environment named Staging with base URL https://example.test.',
      'Create an environment named ' + 'x'.repeat(161) + ' with base URL https://example.test',
    ])
      expect(parseExactEnvironmentCreate(content)).toBeUndefined()
  })

  it('requires quoted suite and module names in one exact request', () => {
    expect(parseExactSuiteCreate('Create a test suite named “Checkout smoke” in module “Checkout”')).toEqual({
      name: 'Checkout smoke',
      moduleName: 'Checkout',
    })
    expect(parseExactSuiteCreate('Please create a suite named "Smoke" in module "Payments".')).toEqual({
      name: 'Smoke',
      moduleName: 'Payments',
    })
    for (const content of [
      'Create a test suite named Smoke in module Checkout',
      'Create a suite named “Smoke”',
      'Create a suite named “Smoke” in module “Checkout” and run it',
      'Create a suite named “Ok” in module “Checkout”',
    ])
      expect(parseExactSuiteCreate(content)).toBeUndefined()
  })

  it('keeps approvals and question replies explicit', () => {
    expect(isAnalysisApprovalRequest('I approve this revision.')).toBe(true)
    expect(isAnalysisApprovalRequest('Approve criteria')).toBe(true)
    expect(isAnalysisApprovalRequest('Can I approve this review?')).toBe(false)
    expect(isAnalysisApprovalRequest('Approve and run the tests.')).toBe(false)
    expect(parseAnalysisAnswerReply('Answer: Staging checkout')).toBe('Staging checkout')
    expect(parseAnalysisAnswerReply('Answer: ')).toBeUndefined()
    expect(parseAnalysisAnswerReply('Staging checkout')).toBeUndefined()
  })

  it('requires the exact displayed Run permission wording', () => {
    expect(isRunPermissionApprovalRequest('Allow and run these tests')).toBe(true)
    expect(isRunPermissionApprovalRequest('Allow and run these tests.')).toBe(true)
    for (const request of ['Approve criteria', 'Run the tests', 'Allow and run these tests again'])
      expect(isRunPermissionApprovalRequest(request)).toBe(false)
  })
})
