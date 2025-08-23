import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const locatorSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  value: z.string().min(1, { message: 'Value is required' }),
  locatorGroupId: z.string().min(1, { message: 'Locator group is required' }),
})

export type Locator = z.infer<typeof locatorSchema>

export const formOpts = formOptions({
  defaultValues: {
    name: '',
    value: '',
    locatorGroupId: '',
  },
  validators: {
    onChange: locatorSchema,
  },
})
