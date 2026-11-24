import { z } from 'zod'

export const namedProjectRecord = z.object({
  id: z.string(),
  name: z.string(),
  targetProjectId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
