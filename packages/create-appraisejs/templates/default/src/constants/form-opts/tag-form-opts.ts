import { z } from 'zod'

export const tagSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  tagExpression: z
    .string()
    .min(1, { message: 'Tag expression is required' })
    .refine(
      value => {
        // Check if the value follows Gherkin tag rules
        // Only one tag allowed per entry - single word after @ symbol
        const trimmedValue = value.trim()
        if (!trimmedValue) return false

        // Should not contain any spaces (only one tag allowed)
        if (trimmedValue.includes(' ')) return false

        // Tag should start with @
        if (!trimmedValue.startsWith('@')) return false

        // Tag should have at least one character after @
        if (trimmedValue.length <= 1) return false

        return true
      },
      {
        message: 'Tag expression must be a single tag starting with @ and contain no spaces (e.g., "@smoke")',
      },
    ),
})

export type Tag = z.infer<typeof tagSchema>

export const formOpts = {
  defaultValues: {
    name: '',
    tagExpression: '',
  },
  validators: {
    onChange: tagSchema,
  },
}
