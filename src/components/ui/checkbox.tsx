'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
  ref?: React.Ref<React.ElementRef<typeof CheckboxPrimitive.Root>>
}

function Checkbox({ className, ref, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'focus-visible:ring-primary/20 data-[state=checked]:border-primary/55 data-[state=checked]:bg-primary/35 peer size-4 shrink-0 rounded border border-white/[0.16] bg-white/[0.025] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_0_12px_-5px_hsl(var(--primary)/0.75)]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
        <Check className="size-4" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
