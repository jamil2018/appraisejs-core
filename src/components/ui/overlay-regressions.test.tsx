// @vitest-environment jsdom

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from './drawer'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { CommandDialog, CommandInput, CommandItem, CommandList } from './command'

function NestedOverlay() {
  return (
    <Dialog>
      <DialogTrigger render={<Button>Open editor</Button>} />
      <DialogContent>
        <DialogTitle>Edit case</DialogTitle>
        <DialogDescription>Choose a field.</DialogDescription>
        <Popover>
          <PopoverTrigger render={<Button>Choose field</Button>} />
          <PopoverContent>
            <button type="button">Name field</button>
          </PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>
  )
}

function ProgrammaticDrawer({ direction }: { direction: 'right' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const fallback = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button ref={fallback} onClick={() => setOpen(true)}>
        Edit step
      </Button>
      <Drawer direction={direction} open={open} onOpenChange={setOpen}>
        <DrawerContent initialFocus={close} finalFocus={fallback}>
          <DrawerTitle>Step details</DrawerTitle>
          <DrawerDescription>Configure the step.</DrawerDescription>
          <DrawerClose render={<Button ref={close}>Done</Button>} />
        </DrawerContent>
      </Drawer>
    </>
  )
}

describe('Base UI overlay composition', () => {
  it('dismisses a nested popover before its dialog and returns focus through each layer', async () => {
    const user = userEvent.setup()
    render(<NestedOverlay />)
    const trigger = screen.getByRole('button', { name: 'Open editor' })
    await user.click(trigger)
    const field = screen.getByRole('button', { name: 'Choose field' })
    await user.click(field)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Name field' })).toBeVisible())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Name field' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Edit case' })).toBeVisible()
    await waitFor(() => expect(field).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it.each(['right', 'bottom'] as const)(
    'focuses, dismisses, and restores a programmatic %s drawer',
    async direction => {
      const user = userEvent.setup()
      const { container } = render(<ProgrammaticDrawer direction={direction} />)
      const trigger = screen.getByRole('button', { name: 'Edit step' })
      await user.click(trigger)
      const drawer = screen.getByRole('dialog', { name: 'Step details' })
      expect(drawer).toHaveAttribute('data-swipe-direction', direction === 'bottom' ? 'down' : 'right')
      expect(container.ownerDocument.querySelector('[data-slot="drawer-overlay"]')).toHaveClass('bg-black/60')
      await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Done' })).toHaveFocus())
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(trigger).toHaveFocus())
      await user.click(trigger)
      await user.click(screen.getByRole('button', { name: 'Done' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    },
  )

  it('opens a nonmodal menu through its rendered button', async () => {
    const user = userEvent.setup()
    render(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button>Actions</Button>} />
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await user.click(screen.getByRole('button', { name: 'Actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible()
  })

  it('preserves keyboard activation and disabled menu items', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button>Actions</Button>} />
        <DropdownMenuContent>
          <DropdownMenuItem disabled onClick={select}>
            Unavailable
          </DropdownMenuItem>
          <DropdownMenuItem onClick={select}>Rename</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await user.tab()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(select).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('keeps cmdk selection inside the Base UI dialog', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(
      <CommandDialog open>
        <CommandInput placeholder="Search pages" />
        <CommandList>
          <CommandItem onSelect={select}>Test cases</CommandItem>
        </CommandList>
      </CommandDialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeVisible()
    await user.type(screen.getByPlaceholderText('Search pages'), 'Test')
    await user.keyboard('{Enter}')
    expect(select).toHaveBeenCalledOnce()
  })
})
