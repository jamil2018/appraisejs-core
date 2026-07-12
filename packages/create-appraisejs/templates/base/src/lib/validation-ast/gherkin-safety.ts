import { z } from 'zod'

const GHERKIN_INJECTION_PREFIX = /^(?:@|Feature\s*:|Rule\s*:|Background\s*:|Scenario(?:\s+Outline)?\s*:|Examples\s*:)/i
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export function gherkinSafeSingleLineSchema(maxCharacters: number) {
  return z
    .string()
    .min(1)
    .max(maxCharacters)
    .refine(value => !/[\r\n]/.test(value), 'must be a single line')
    .refine(value => !CONTROL_CHARACTER.test(value), 'must not contain control characters')
    .refine(value => !GHERKIN_INJECTION_PREFIX.test(value.trimStart()), 'must not begin with Gherkin grammar or a tag')
}

export function assertSafeGeneratedGherkin(value: unknown): asserts value is string[] {
  const documents = z.array(z.string().min(1).max(256_000)).max(512).parse(value)
  for (const document of documents) {
    if (document.includes('\r')) throw new Error('Generated Gherkin must use LF line endings.')
    const lines = document.split('\n')
    const scenario = /^Scenario: (.+)$/.exec(lines[0] ?? '')
    if (!scenario) throw new Error('Generated Gherkin must begin with one Scenario line.')
    gherkinSafeSingleLineSchema(2_000).parse(scenario[1])
    for (const line of lines.slice(1)) {
      const step = /^  (?:Given|When|Then|And) (.+)$/.exec(line)
      if (!step) throw new Error('Generated Gherkin contains an unexpected grammar line.')
      gherkinSafeSingleLineSchema(2_000).parse(step[1])
    }
  }
}
