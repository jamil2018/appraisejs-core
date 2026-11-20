import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { appManagedTriageAssignmentSchema, readAppManagedTriageEvidence } from './app-managed-triage-evidence'

const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
function assignment(text: string) {
  return appManagedTriageAssignmentSchema.parse({
    reportRevisionId: 'report',
    executionCycleId: 'execution',
    cycleId: 'cycle',
    inputHash: hash('input'),
    runs: [
      {
        evidenceReceiptId: 'receipt',
        evidence: { artifacts: [{ kind: 'report', contentHash: hash(text), size: Buffer.byteLength(text) }] },
      },
    ],
  })
}

describe('local Triager sealed evidence reads', () => {
  it('reads every bounded page through the canonical receipt selector and verifies the full text hash', async () => {
    const text = 'a'.repeat(70_000)
    const invoke = vi.fn(async (call: { arguments: Record<string, unknown> }) => {
      const offset = Number(call.arguments.offset),
        endOffset = Math.min(offset + 65_536, text.length)
      return {
        result: {
          receiptId: 'receipt',
          artifactKind: 'report',
          contentHash: hash(text),
          size: text.length,
          offset,
          endOffset,
          complete: endOffset === text.length,
          text: text.slice(offset, endOffset),
        },
      }
    })
    const result = await readAppManagedTriageEvidence(assignment(text), invoke, 'original')
    expect(result).toEqual([
      { receiptId: 'receipt', artifactKind: 'report', contentHash: hash(text), size: text.length, text },
    ])
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1]![0].arguments).toEqual({
      receiptId: 'receipt',
      artifactKind: 'report',
      offset: 65_536,
      limit: 65_536,
    })
  })

  it('rejects altered bytes despite unchanged descriptor metadata', async () => {
    await expect(
      readAppManagedTriageEvidence(
        assignment('expected'),
        async () => ({
          result: {
            receiptId: 'receipt',
            artifactKind: 'report',
            contentHash: hash('expected'),
            size: 8,
            offset: 0,
            endOffset: 8,
            complete: true,
            text: 'tampered',
          },
        }),
        'original',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('keeps absent runtime artifacts absent rather than inventing text evidence', async () => {
    const scope = assignment('')
    scope.runs[0]!.evidence.artifacts = []
    const invoke = vi.fn()
    expect(await readAppManagedTriageEvidence(scope, invoke, 'original')).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects a non-progressing incomplete page', async () => {
    await expect(
      readAppManagedTriageEvidence(
        assignment('expected'),
        async () => ({
          result: {
            receiptId: 'receipt',
            artifactKind: 'report',
            contentHash: hash('expected'),
            size: 8,
            offset: 0,
            endOffset: 0,
            complete: false,
            text: '',
          },
        }),
        'original',
      ),
    ).rejects.toThrow('paging')
  })
})
