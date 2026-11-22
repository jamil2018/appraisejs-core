'use client'

import * as React from 'react'
import { useRender } from '@base-ui/react/use-render'
import { cn } from '@/lib/utils'

function Textarea({ className, ref, ...props }: React.ComponentProps<'textarea'>) {
  return useRender({
    defaultTagName: 'textarea',
    ref,
    props: {
      ...props,
      className: cn(
        'app-field app-focus flex min-h-24 w-full rounded-lg border px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ),
    },
  })
}

export { Textarea }
