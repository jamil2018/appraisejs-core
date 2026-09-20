import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ref, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'focus-visible:border-primary/45 focus-visible:ring-primary/15 flex h-9 w-full rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 py-1 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-10px_24px_rgba(0,0,0,0.08)] backdrop-blur-md transition-[background-color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
}
Input.displayName = 'Input'

export { Input }
