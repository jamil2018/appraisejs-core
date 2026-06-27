import { z } from 'zod'

export const locatorGroupSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  moduleId: z.string().min(1, { message: 'Module is required' }),
  locators: z.array(z.string()).optional(),
  route: z.string().trim().min(1, { message: 'Route is required' }),
})

export type LocatorGroup = z.infer<typeof locatorGroupSchema>

export const locatorGroupFormOpts = {
  defaultValues: {
    name: '',
    moduleId: '',
    locators: [],
    route: '',
  },
  validators: {
    onChange: locatorGroupSchema,
  },
}
