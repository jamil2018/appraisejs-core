'use client'

import * as React from 'react'
import { Drawer as Primitive } from '@base-ui/react/drawer'
import { cn } from '@/lib/utils'

const DirectionContext = React.createContext<'top' | 'right' | 'bottom' | 'left'>('bottom')
type DrawerProps = React.ComponentProps<typeof Primitive.Root> & { direction?: 'top' | 'right' | 'bottom' | 'left' }
function Drawer({ direction = 'bottom', ...props }: DrawerProps) {
  const swipeDirection = direction === 'bottom' ? 'down' : direction === 'top' ? 'up' : direction
  return (
    <DirectionContext.Provider value={direction}>
      <Primitive.Root swipeDirection={swipeDirection} {...props} />
    </DirectionContext.Provider>
  )
}
const DrawerClose = Primitive.Close
const placement = {
  bottom:
    'inset-x-0 bottom-0 rounded-t-xl border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full',
  top: 'inset-x-0 top-0 rounded-b-xl border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full',
  right:
    'inset-y-0 right-0 h-full w-[min(28rem,100vw)] rounded-l-xl border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full',
  left: 'inset-y-0 left-0 h-full w-[min(28rem,100vw)] rounded-r-xl border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full',
}
type DrawerContentProps = Omit<React.ComponentProps<typeof Primitive.Popup>, 'className'> & {
  className?: string
  showOverlay?: boolean
  overlayClassName?: string
  onOverlayClick?: React.MouseEventHandler<HTMLDivElement>
}
function DrawerContent({
  className,
  children,
  showOverlay = true,
  overlayClassName,
  onOverlayClick,
  initialFocus = true,
  ...props
}: DrawerContentProps) {
  const direction = React.useContext(DirectionContext)
  return (
    <Primitive.Portal>
      {showOverlay ? (
        <Primitive.Backdrop
          data-slot="drawer-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-black/60 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            overlayClassName,
          )}
          onClick={onOverlayClick}
        />
      ) : null}
      <Primitive.Viewport className="pointer-events-none fixed inset-0 z-50">
        <Primitive.Popup
          initialFocus={initialFocus}
          className={cn(
            'app-glass pointer-events-auto fixed flex max-h-dvh translate-x-[var(--drawer-swipe-movement-x,0px)] translate-y-[var(--drawer-swipe-movement-y,0px)] flex-col text-foreground outline-none transition-transform duration-200 data-[swiping]:transition-none motion-reduce:transition-none',
            placement[direction],
            className,
          )}
          {...props}
        >
          <Primitive.Content className="flex min-h-0 flex-1 flex-col">{children}</Primitive.Content>
        </Primitive.Popup>
      </Primitive.Viewport>
    </Primitive.Portal>
  )
}
function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-2 p-4 text-left', className)} {...props} />
}
function DrawerTitle({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.Title>, 'className'> & { className?: string }) {
  return <Primitive.Title className={cn('text-lg font-semibold leading-tight tracking-tight', className)} {...props} />
}
function DrawerDescription({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Primitive.Description>, 'className'> & { className?: string }) {
  return <Primitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}
export { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription }
