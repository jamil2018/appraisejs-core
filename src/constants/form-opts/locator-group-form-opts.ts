import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const locatorGroupSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  moduleId: z.string().min(1, { message: 'Module is required' }),
  locators: z.array(z.string()).optional(),
  route: z.string().optional(),
})

// Schema for checking unique name (used in server actions)
export const locatorGroupUniqueNameSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  id: z.string().optional(), // For updates, exclude current record
})

export type LocatorGroup = z.infer<typeof locatorGroupSchema>

export const formOpts = formOptions({
  defaultValues: {
    name: '',
    moduleId: '',
    locators: [],
    route: '',
  },
  validators: {
    onChange: locatorGroupSchema,
  },
})
