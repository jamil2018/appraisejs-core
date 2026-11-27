import { describe, expect, it } from 'vitest'

import {
  isAnalysisApprovalRequest,
  parseAnalysisAnswerReply,
  parseAttachedCaseRename,
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

  it('keeps approvals and question replies explicit', () => {
    expect(isAnalysisApprovalRequest('I approve this revision.')).toBe(true)
    expect(isAnalysisApprovalRequest('Approve criteria')).toBe(true)
    expect(isAnalysisApprovalRequest('Can I approve this review?')).toBe(false)
    expect(isAnalysisApprovalRequest('Approve and run the tests.')).toBe(false)
    expect(parseAnalysisAnswerReply('Answer: Staging checkout')).toBe('Staging checkout')
    expect(parseAnalysisAnswerReply('Answer: ')).toBeUndefined()
    expect(parseAnalysisAnswerReply('Staging checkout')).toBeUndefined()
  })
})
