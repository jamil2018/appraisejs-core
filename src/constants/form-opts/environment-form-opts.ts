import { formOptions } from '@tanstack/react-form/nextjs'
import { z } from 'zod'

export const environmentSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  baseUrl: z.string().url({ message: 'Base URL must be a valid URL' }),
  apiBaseUrl: z.string().url({ message: 'API Base URL must be a valid URL' }).optional().or(z.literal('')),
  username: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
})

export type Environment = z.infer<typeof environmentSchema>

export const formOpts = formOptions({
  defaultValues: {
    name: '',
    baseUrl: '',
    apiBaseUrl: '',
    username: '',
    password: '',
  },
  validators: {
    onChange: environmentSchema,
  },
})
