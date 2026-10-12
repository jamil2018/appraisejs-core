import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-medium backdrop-blur-xl transition-[transform,filter,background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px active:scale-[0.985] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-white/[0.15] [background-color:rgba(28,32,39,0.58)] bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)),linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.055))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.2),0_10px_24px_-18px_hsl(var(--primary)/0.48)] hover:border-white/[0.22] hover:brightness-110',
        destructive:
          'border-destructive/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02)),linear-gradient(135deg,hsl(var(--destructive)/0.34),hsl(var(--destructive)/0.14))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_24px_-18px_hsl(var(--destructive)/0.45)] hover:border-destructive/55 hover:brightness-110',
        outline:
          'border-white/[0.11] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-1px_0_rgba(255,255,255,0.025)] hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-foreground',
        secondary:
          'border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.025))] text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:border-white/[0.2] hover:bg-white/[0.075]',
        ghost:
          'border-transparent bg-transparent text-foreground/80 shadow-none hover:border-white/[0.08] hover:bg-white/[0.045] hover:text-foreground',
        link: 'border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
}
Button.displayName = 'Button'

export { Button, buttonVariants }
