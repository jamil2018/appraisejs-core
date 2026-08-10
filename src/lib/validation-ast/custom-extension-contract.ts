import { z } from 'zod'

const id = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const field = z.object({
  name: id,
  type: z.enum(['string', 'number', 'boolean', 'locator', 'json']),
  required: z.boolean().optional(),
})

export const customActionExtensionProposalSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    version: z.string().regex(/^\d+(?:\.\d+){0,2}$/),
    title: z.string().min(1).max(2_000),
    description: z.string().min(1).max(2_000),
    reasonExistingActionsAreInsufficient: z.string().min(1).max(2_000),
    inputs: z.array(field.extend({ required: z.boolean() })).max(32),
    outputs: z.array(field.omit({ required: true })).max(32),
    requiredCapabilities: z.array(id).max(16),
    implementation: z.object({
      language: z.literal('typescript'),
      source: z
        .string()
        .min(1)
        .refine(value => Buffer.byteLength(value, 'utf8') <= 65_536),
    }),
  })
  .strict()

export type CustomActionExtensionProposal = z.infer<typeof customActionExtensionProposalSchema>
