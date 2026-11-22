'use client'

import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CheckedState = boolean | 'indeterminate'
type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange' | 'className'
> & {
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?: (checked: CheckedState) => void
  className?: string
}

function Checkbox({ className, checked, defaultChecked, onCheckedChange, ...props }: CheckboxProps) {
  const [defaultMixed, setDefaultMixed] = React.useState(defaultChecked === 'indeterminate')
  const indeterminate = checked === undefined ? defaultMixed : checked === 'indeterminate'
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'app-focus peer flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:border-primary data-[indeterminate]:border-primary data-[checked]:bg-primary data-[indeterminate]:bg-primary',
        className,
      )}
      checked={checked === undefined ? undefined : checked === true}
      defaultChecked={defaultChecked === true}
      indeterminate={indeterminate}
      onCheckedChange={next => {
        setDefaultMixed(false)
        onCheckedChange?.(next)
      }}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {indeterminate ? <Minus className="size-3" /> : <Check className="size-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
