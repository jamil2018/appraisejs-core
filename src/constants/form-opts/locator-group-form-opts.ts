import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const locatorGroupSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  moduleId: z.string().min(1, { message: 'Module is required' }),
  locators: z.array(z.string()).optional(),
})

export type LocatorGroup = z.infer<typeof locatorGroupSchema>

export const formOpts = formOptions({
  defaultValues: {
    name: '',
    moduleId: '',
    locators: [],
  },
  validators: {
    onChange: locatorGroupSchema,
  },
})
