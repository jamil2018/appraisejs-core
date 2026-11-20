import { describe, expect, it } from 'vitest'
import { formatAnalysisFeedback, parseAnalysisCriteriaFeedback } from './analysis-feedback'

const analysis = {
  requirements: [{ requirementId: 'REQ-1', statement: 'Pay by card.' }],
  obligations: [{ obligationId: 'OBL-1', statement: 'Show a receipt.' }],
}
describe('exact item feedback presentation', () => {
  it('round trips multiline feedback, keeps IDs internal and rejects foreign or duplicate items', () => {
    const recorded = formatAnalysisFeedback(analysis, '', {
      'obligation:OBL-1': 'Include tax.\n\nShow totals.',
      'foreign:other': 'Ignored.',
    })
    expect(parseAnalysisCriteriaFeedback(analysis, recorded)).toEqual({
      'obligation:OBL-1': 'Include tax.\n\nShow totals.',
    })
    expect(parseAnalysisCriteriaFeedback(analysis, recorded.replace('OBL-1', 'foreign'))).toEqual({})
    expect(parseAnalysisCriteriaFeedback(analysis, 'Appraise item feedback v1:\n{}')).toEqual({})
  })
  it('reads earlier exact statement prefixes without changing the stored payload', () => {
    expect(
      parseAnalysisCriteriaFeedback(analysis, 'Acceptance criterion OBL-1 (Show a receipt.): Include tax.'),
    ).toEqual({ 'obligation:OBL-1': 'Include tax.' })
    expect(
      parseAnalysisCriteriaFeedback(analysis, 'Acceptance criterion OBL-1 (Other statement.): Include tax.'),
    ).toEqual({})
  })
})
