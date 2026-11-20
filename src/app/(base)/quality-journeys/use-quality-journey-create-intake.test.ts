// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  create: vi.fn(),
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
  createQualityJourneyDraftAction: mocks.create,
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
  it('replays the exact confirmation after a lost response without saving another draft version', async () => {
    mocks.hash.mockResolvedValue(hash)
    mocks.confirm.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({
      success: true,
      data: { journeyId: 'journey-1', replayed: true },
    })
    const { result } = renderIntake()
    await act(async () => result.current.actions.submit())
    const original = mocks.confirm.mock.calls[0]![0]
    expect(result.current.state.error).toMatch(/response was interrupted/i)
    await act(async () => result.current.actions.submit())
    expect(mocks.save).toHaveBeenCalledOnce()
    expect(mocks.hash).toHaveBeenCalledOnce()
    expect(mocks.confirm).toHaveBeenNthCalledWith(2, original)
    expect(mocks.push).toHaveBeenCalledOnce()
  })
  it('recovers the first autosave with its original payload before saving later edits', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Lost draft response')).mockResolvedValueOnce({
      success: true,
      data: { draft: { ...draft, version: 1 } },
    })
    const { result } = renderHook(() => useQualityJourneyCreateIntake({ projectId: 'project-1', push: mocks.push }))
    act(() => result.current.update({ objective: 'First brief' }))
    await act(async () => {
      await result.current.actions.enqueueSave()
    })
    expect(result.current.saveStatus).toBe('failed')
    act(() => result.current.update({ objective: 'Refined brief' }))
    await act(async () => {
      await result.current.actions.enqueueSave()
    })
    expect(mocks.create.mock.calls[1]![0]).toEqual(mocks.create.mock.calls[0]![0])
    expect(mocks.create.mock.calls[0]![0].requirement).toEqual({ objective: 'First brief' })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ requirement: { objective: 'Refined brief' } }))
    expect(result.current.saveStatus).toBe('saved')
  })
})
