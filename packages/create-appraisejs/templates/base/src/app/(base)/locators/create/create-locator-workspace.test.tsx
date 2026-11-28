// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CreateLocatorWorkspace from './create-locator-workspace'

const {
  push,
  refresh,
  toast,
  startLocatorPickerSessionAction,
  getLocatorPickerSessionAction,
  closeLocatorPickerSessionAction,
  savePickedLocatorAction,
} = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  startLocatorPickerSessionAction: vi.fn(),
  getLocatorPickerSessionAction: vi.fn(),
  closeLocatorPickerSessionAction: vi.fn(),
  savePickedLocatorAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

vi.mock('@/actions/locator-picker/locator-picker-actions', () => ({
  startLocatorPickerSessionAction,
  closeLocatorPickerSessionAction,
  getLocatorPickerSessionAction,
  savePickedLocatorAction,
}))

describe('CreateLocatorWorkspace', () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    toast.mockClear()
    startLocatorPickerSessionAction.mockReset()
    getLocatorPickerSessionAction.mockReset()
    closeLocatorPickerSessionAction.mockReset()
    savePickedLocatorAction.mockReset()
  })

  it('launches chromium from an environment', async () => {
    const user = userEvent.setup()

    startLocatorPickerSessionAction.mockResolvedValue({
      status: 200,
      data: {
        sessionId: 'session-1',
        launchSource: { environmentId: 'env-1', environmentName: 'Staging', url: 'https://example.com' },
        browserName: 'chromium',
        status: 'ready',
        currentUrl: 'https://example.com',
        currentPathname: '/',
        pageTitle: 'Home',
        companionPid: 123,
        startedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:01.000Z',
      },
    })

    render(
      <CreateLocatorWorkspace
        environments={[{ id: 'env-1', name: 'Staging' } as never]}
        locatorGroups={[]}
        modules={[]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Launch Chromium' }))

    await waitFor(() => {
      expect(startLocatorPickerSessionAction).toHaveBeenCalledWith({
        environmentId: 'env-1',
        url: undefined,
      })
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Chromium launched',
      description:
        'Use the in-browser Appraise picker panel to start picking, click one element, then confirm Use selector.',
    })
  })

  it('cancels an active picker and reports that no target was picked', async () => {
    const user = userEvent.setup()
    const session = {
      sessionId: 'session-1',
      launchSource: { environmentId: 'env-1', environmentName: 'Staging', url: 'https://example.test' },
      browserName: 'chromium',
      status: 'ready',
      currentUrl: 'https://example.test',
      currentPathname: '/',
      pageTitle: 'Home',
      companionPid: 123,
      startedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:01.000Z',
    }
    startLocatorPickerSessionAction.mockResolvedValue({ status: 200, data: session })
    closeLocatorPickerSessionAction.mockResolvedValue({
      status: 200,
      data: { ...session, status: 'closed', companionPid: null },
    })

    render(<CreateLocatorWorkspace environments={[{ id: 'env-1', name: 'Staging' }]} locatorGroups={[]} modules={[]} />)

    await user.click(screen.getByRole('button', { name: 'Launch Chromium' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel picker' }))

    await waitFor(() => expect(closeLocatorPickerSessionAction).toHaveBeenCalledWith('session-1'))
    expect(await screen.findByText('No target picked')).toBeVisible()
    expect(savePickedLocatorAction).not.toHaveBeenCalled()
  })

  it('brings a picked target into the editor before saving the reviewed selector', async () => {
    const user = userEvent.setup()
    const session = {
      sessionId: 'session-1',
      launchSource: { environmentId: 'env-1', environmentName: 'Staging', url: 'https://example.test' },
      browserName: 'chromium',
      status: 'ready',
      currentUrl: 'https://example.test/checkout',
      currentPathname: '/checkout',
      pageTitle: 'Checkout',
      companionPid: 123,
      startedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:01.000Z',
    }
    startLocatorPickerSessionAction.mockResolvedValue({ status: 200, data: session })
    getLocatorPickerSessionAction.mockResolvedValue({
      status: 200,
      data: {
        ...session,
        status: 'picked',
        updatedAt: '2026-11-01T00:00:02.000Z',
        pickedLocator: {
          sessionId: 'session-1',
          selector: '[data-testid="place-order"]',
          currentUrl: 'https://example.test/checkout',
          pathname: '/checkout',
          pageTitle: 'Checkout',
          tagName: 'button',
          accessibleName: 'Place order',
          matchCount: 1,
          checkedAt: '2026-11-01T00:00:02.000Z',
          checkedUrl: 'https://example.test/checkout',
        },
      },
    })
    savePickedLocatorAction.mockResolvedValue({ status: 200, message: 'Locator saved successfully', data: {} })

    render(
      <CreateLocatorWorkspace
        environments={[{ id: 'env-1', name: 'Staging' }]}
        locatorGroups={[{ id: 'group-1', name: 'Checkout', route: '/checkout', moduleId: 'module-1' }]}
        modules={[{ id: 'module-1', name: 'Store', parentId: null }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Launch Chromium' }))
    expect(await screen.findByText('Picked from page', {}, { timeout: 4000 })).toBeVisible()
    expect(screen.getByLabelText('Selector')).toHaveValue('[data-testid="place-order"]')
    expect(screen.getByLabelText('Locator Name')).toHaveValue('Place order')
    await user.click(screen.getByRole('button', { name: 'Save Locator' }))
    await waitFor(() =>
      expect(savePickedLocatorAction).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          selector: '[data-testid="place-order"]',
          existingLocatorGroupId: 'group-1',
        }),
      ),
    )
  })

  it('saves a locator in create-group mode and navigates back to locators', async () => {
    const user = userEvent.setup()

    savePickedLocatorAction.mockResolvedValue({
      status: 200,
      message: 'Locator saved successfully',
      data: {
        locatorId: 'locator-1',
        locatorName: 'Login button',
        locatorGroupId: 'group-1',
        locatorGroupName: 'Login',
        selector: 'button[data-testid="login"]',
        route: '/account/login',
        moduleId: 'module-1',
      },
    })

    render(
      <CreateLocatorWorkspace
        environments={[{ id: 'env-1', name: 'Staging' } as never]}
        locatorGroups={[]}
        modules={[{ id: 'module-1', name: 'Account' } as never]}
        initialValues={{
          resolutionMode: 'create',
        }}
      />,
    )

    await user.type(screen.getByLabelText('Locator Name'), 'Login button')
    fireEvent.change(screen.getByLabelText('Selector'), {
      target: { value: 'button[data-testid="login"]' },
    })
    await user.type(screen.getByLabelText('Locator Group Name'), 'Login')
    await user.clear(screen.getByLabelText('Route'))
    await user.type(screen.getByLabelText('Route'), '/account/login')
    await user.click(screen.getByRole('combobox', { name: 'Module' }))
    await user.click(await screen.findByRole('option', { name: 'Account' }))
    await user.click(screen.getByRole('button', { name: 'Save Locator' }))

    await waitFor(() => {
      expect(savePickedLocatorAction).toHaveBeenCalledWith({
        locatorId: undefined,
        sessionId: undefined,
        locatorName: 'Login button',
        selector: 'button[data-testid="login"]',
        resolutionMode: 'create',
        existingLocatorGroupId: undefined,
        newLocatorGroupName: 'Login',
        route: '/account/login',
        moduleId: 'module-1',
      })
    })

    expect(push).toHaveBeenCalledWith('/locators')
    expect(refresh).toHaveBeenCalled()
  })

  it('calls onSaveSuccess and closes in inline mode without navigating', async () => {
    const user = userEvent.setup()
    const onSaveSuccess = vi.fn()
    const onClose = vi.fn()

    savePickedLocatorAction.mockResolvedValue({
      status: 200,
      message: 'Locator saved successfully',
      data: {
        locatorId: 'locator-1',
        locatorName: 'Login button',
        locatorGroupId: 'group-1',
        locatorGroupName: 'Login',
        selector: 'button[data-testid="login"]',
        route: '/login',
        moduleId: 'module-1',
      },
    })

    render(
      <CreateLocatorWorkspace
        displayMode="inline"
        environments={[{ id: 'env-1', name: 'Staging' }]}
        locatorGroups={[{ id: 'group-1', name: 'Login', route: '/login', moduleId: 'module-1' }]}
        modules={[{ id: 'module-1', name: 'Account', parentId: null }]}
        initialValues={{
          locatorName: 'Login button',
          selector: 'button[data-testid="login"]',
          resolutionMode: 'existing',
          existingLocatorGroupId: 'group-1',
        }}
        onSaveSuccess={onSaveSuccess}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Save Locator' }))

    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalledWith({
        locatorId: 'locator-1',
        locatorName: 'Login button',
        locatorGroupId: 'group-1',
        locatorGroupName: 'Login',
        selector: 'button[data-testid="login"]',
        route: '/login',
        moduleId: 'module-1',
      })
    })

    expect(onClose).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
