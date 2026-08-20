import { describe, expect, it } from 'vitest'

import { parseMcpToolArguments, unwrapMcpToolResult } from './mcp-call.js'

describe('local MCP bridge input', () => {
  it('accepts object arguments', () => {
    expect(parseMcpToolArguments('{"assessmentId":"assessment-1"}')).toEqual({ assessmentId: 'assessment-1' })
  })

  it('unwraps the common single JSON text result for compact worker output', () => {
    expect(unwrapMcpToolResult({ content: [{ type: 'text', text: '{"status":"ready"}' }] })).toEqual({
      status: 'ready',
    })
  })

  it('preserves non-JSON MCP results', () => {
    const result = { content: [{ type: 'text', text: 'plain text' }] }
    expect(unwrapMcpToolResult(result)).toBe(result)
  })

  it.each(['[]', 'null', '"value"'])('rejects non-object JSON: %s', value => {
    expect(() => parseMcpToolArguments(value)).toThrow('JSON object')
  })
})
