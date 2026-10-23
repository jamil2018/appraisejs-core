// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  save: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  ensureEnvironment: vi.fn(),
}))

vi.mock('@/lib/quality-journey/requirement-browser', () => ({ hashQualityJourneyRequirementForBrowser: mocks.hash }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('./quality-journey-actions', () => ({
  archiveQualityJourneyDraftAction: vi.fn(),
  confirmQualityJourneyDraftAction: mocks.confirm,
  createQualityJourneyDraftAction: vi.fn(),
  ensureQualityJourneyIntakeEnvironmentAction: mocks.ensureEnvironment,
  restoreQualityJourneyDraftAction: vi.fn(),
  saveQualityJourneyDraftAction: mocks.save,
}))

import { useQualityJourneyCreateIntake } from './use-quality-journey-create-intake'

const hash = `sha256:${'c'.repeat(64)}`
const draft = {
  id: 'draft-1',
  version: 4,
  draftHash: `sha256:${'a'.repeat(64)}`,
  currentStep: 3,
  requirement: { objective: 'Checkout', includedScope: ['Order'], desiredEvidenceSignals: ['Order ID'] },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function renderIntake() {
  return renderHook(() =>
    useQualityJourneyCreateIntake({ draft, initialEnvironments: [], projectId: 'project-1', push: mocks.push }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  mocks.save.mockResolvedValue({
    success: true,
    data: { draft: { ...draft, version: 5, draftHash: `sha256:${'b'.repeat(64)}` } },
  })
  mocks.confirm.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Quality Journey intake asynchronous confirmation', () => {
  it('waits for the captured requirement digest before saving and confirming that same revision', async () => {
    const digest = deferred<string>()
    mocks.hash.mockReturnValue(digest.promise)
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.hash).toHaveBeenCalledWith(expect.objectContaining({ objective: 'Checkout' }))

    await act(async () => digest.resolve(hash))
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ requirement: mocks.hash.mock.calls[0]![0] }))
    expect(mocks.confirm).toHaveBeenCalledWith({
      draftId: 'draft-1',
      expectedVersion: 5,
      expectedDraftHash: `sha256:${'b'.repeat(64)}`,
      requirementHash: hash,
    })
    expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-1?project=project-1')
  })

  it('does not enqueue the captured requirement if the user edits while its digest is pending', async () => {
    const digest = deferred<string>()
    mocks.hash.mockReturnValue(digest.promise)
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())
    act(() => result.current.update({ objective: 'Changed checkout' }))
    await act(async () => digest.resolve(hash))

    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(result.current.state.error).toMatch(/brief changed/i)
    expect(result.current.requirement.objective).toBe('Changed checkout')
  })

  it('rejects confirmation if an environment is registered while the digest is pending', async () => {
    const digest = deferred<string>()
    mocks.hash.mockReturnValue(digest.promise)
    mocks.ensureEnvironment.mockResolvedValue({
      success: true,
      data: { environment: { id: 'environment-new', name: 'New staging', baseUrl: 'https://example.test' } },
    })
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())
    await act(async () => result.current.actions.registerEnvironment())
    await act(async () => digest.resolve(hash))

    expect(result.current.requirement.environmentIds).toEqual(['environment-new'])
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(result.current.state.error).toMatch(/brief changed/i)
  })

  it('keeps the latest-save guard when an edit arrives after hashing but before the save completes', async () => {
    const save = deferred<unknown>()
    mocks.hash.mockResolvedValue(hash)
    mocks.save.mockReturnValue(save.promise)
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())
    expect(mocks.save).toHaveBeenCalledOnce()
    act(() => result.current.update({ objective: 'Newer checkout' }))
    await act(async () => save.resolve({ success: true, data: { draft: { ...draft, version: 5 } } }))

    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(result.current.saveStatus).toBe('dirty')
  })

  it('does not save or confirm when digest generation fails', async () => {
    mocks.hash.mockRejectedValue(new Error('Digest unavailable'))
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())

    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(result.current.state.error).toMatch(/unable to verify/i)
  })
})
