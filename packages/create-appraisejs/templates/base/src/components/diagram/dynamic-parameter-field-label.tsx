'use client'

import { Label } from '@/components/ui/label'

export function DynamicParameterFieldLabel({
  name,
  defaultValueInput,
  htmlFor,
}: {
  name: string
  defaultValueInput: boolean
  htmlFor?: string
}) {
  return (
    <Label htmlFor={htmlFor} className="text-primary">
      {defaultValueInput ? `Default ${name}` : name} {!defaultValueInput && <span className="text-red-500">*</span>}
    </Label>
  )
}
