import ErrorMessage from '@/components/form/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Save } from 'lucide-react'

export type TextFormFieldState = {
  name: string
  state: { value: string; meta: { errors: unknown[]; isTouched: boolean } }
  handleChange(value: string): void
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message
  return String(error)
}

export function FormFieldErrors({ errors, isTouched }: { errors: unknown[]; isTouched: boolean }) {
  if (!isTouched) return null
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      {errors.map(error => (
        <ErrorMessage key={errorMessage(error)} message={errorMessage(error)} visible={true} />
      ))}
    </div>
  )
}

export function TextFormField({
  field,
  label,
  placeholder,
  description,
  autoComplete,
  className = 'mb-4 flex flex-col gap-2 lg:w-1/3',
}: {
  field: TextFormFieldState
  label: string
  placeholder?: string
  description?: string
  autoComplete?: string
  className?: string
}) {
  return (
    <div className={className}>
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onChange={event => field.handleChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      <FormFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
    </div>
  )
}

export function FormSubmitButton({ canSubmit, isSubmitting }: { canSubmit: boolean; isSubmitting: boolean }) {
  return (
    <Button type="submit" disabled={!canSubmit}>
      <Save className="size-4" aria-hidden />
      <span className="font-bold">{isSubmitting ? '...' : 'Save'}</span>
    </Button>
  )
}
