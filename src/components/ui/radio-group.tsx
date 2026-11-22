'use client'

import * as React from 'react'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cn } from '@/lib/utils'

type RadioGroupProps = Omit<RadioGroupPrimitive.Props<string>, 'className'> & { className?: string }
function RadioGroup({ className, ...props }: RadioGroupProps) {
  return <RadioGroupPrimitive className={cn('grid gap-2', className)} {...props} />
}

function RadioGroupItem({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Radio.Root>, 'className'> & { className?: string }) {
  return (
    <Radio.Root
      className={cn(
        'app-focus flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background text-primary disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:border-primary',
        className,
      )}
      {...props}
    >
      <Radio.Indicator className="size-2 rounded-full bg-current" />
    </Radio.Root>
  )
}

export { RadioGroup, RadioGroupItem }
