import { z } from 'zod'

// Accept legacy kebab/UUID identifiers and namespaced opaque identifiers such as loc_01abc.
export const catalogEntityIdSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|[a-z][a-z0-9]*_[a-z0-9-]+)$/)

export const catalogEntityVersionSchema = z.string().regex(/^\d+(?:\.\d+){0,2}$/)

export const locatorCatalogReferenceSchema = z.object({
  id: catalogEntityIdSchema,
  version: catalogEntityVersionSchema,
})
