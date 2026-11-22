'use client'

import * as React from 'react'
import { useRender } from '@base-ui/react/use-render'
import { cn } from '@/lib/utils'

function Label({ className, ref, ...props }: React.ComponentProps<'label'>) {
  return useRender({
    defaultTagName: 'label',
    ref,
    props: {
      ...props,
      className: cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      ),
    },
  })
}

export { Label }
