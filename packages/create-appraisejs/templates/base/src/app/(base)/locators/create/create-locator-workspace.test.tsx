// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CreateLocatorWorkspace from './create-locator-workspace'

const { push, refresh, toast, startLocatorPickerSessionAction, savePickedLocatorAction } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  startLocatorPickerSessionAction: vi.fn(),
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
  getLocatorPickerSessionAction: vi.fn(),
  savePickedLocatorAction,
}))

describe('CreateLocatorWorkspace', () => {
  beforeEach(() => {
    push.mockClear()
    refresh.mockClear()
    toast.mockClear()
    startLocatorPickerSessionAction.mockReset()
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
    await user.click(screen.getByRole('option', { name: 'Account' }))
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
