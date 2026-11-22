'use client'

import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'app-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'border-danger-border bg-danger-surface text-danger hover:bg-danger-surface/80',
        outline: 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        link: 'border-transparent bg-transparent text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-9 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = Omit<React.ComponentProps<typeof ButtonPrimitive>, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string }

// Links retain their navigation semantics; Base Button is reserved for actions.
function RenderedButton({ render, ref, ...props }: Omit<ButtonProps, 'nativeButton'>) {
  return useRender({ defaultTagName: 'a', render, ref, state: { disabled: props.disabled ?? false }, props })
}

function Button({ className, variant, size, nativeButton, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)
  return props.render && nativeButton === false ? (
    <RenderedButton className={classes} {...props} />
  ) : (
    <ButtonPrimitive className={classes} nativeButton={nativeButton} {...props} />
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
