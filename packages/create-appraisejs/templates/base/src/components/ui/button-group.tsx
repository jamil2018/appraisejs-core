import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const buttonGroupVariants = cva(
  'flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*=w-])]:w-fit [&>input]:flex-1',
  {
    variants: {
      orientation: {
        horizontal:
          '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
        vertical:
          'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none',
      },
    },
    defaultVariants: {
      orientation: 'horizontal',
    },
  },
)

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )
}

function ButtonGroupSeparator({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn('relative self-stretch bg-border data-[orientation=vertical]:h-auto', className)}
      {...props}
    />
  )
}

function ButtonGroupText({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="button-group-text"
      className={cn(
        'shadow-xs flex items-center gap-2 rounded-md border bg-muted px-4 text-sm font-medium [&_svg]:pointer-events-none [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants }
