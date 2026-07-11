import { z } from 'zod'

export const actionIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'Expected a lowercase dotted or kebab-case action ID')

export const actionVersionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/, 'Expected a numeric action version')

export const actionReferenceIdentitySchema = z.object({
  id: actionIdSchema,
  version: actionVersionSchema,
})

export type ActionReferenceIdentity = z.infer<typeof actionReferenceIdentitySchema>
