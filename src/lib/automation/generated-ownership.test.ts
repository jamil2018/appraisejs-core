import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERATED_AUTOMATION_MARKER, readGeneratedAutomationOwnership } from './generated-ownership'

describe('generated automation ownership', () => {
  it('recognizes a strict Appraise projection marker', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-ownership-'))
    await writeFile(
      path.join(directory, GENERATED_AUTOMATION_MARKER),
      JSON.stringify({
        schemaVersion: '1',
        owner: 'appraise',
        authority: 'reviewed-validation-ast',
        mutationPolicy: 'replace-through-appraise-export-only',
        projectId: 'project-one',
        validationHash: `sha256:${'a'.repeat(64)}`,
        publishOperationId: 'operation-one',
        authoredExtensionPaths: ['extensions/custom/v1.mjs'],
      }),
    )
    await expect(readGeneratedAutomationOwnership(directory)).resolves.toMatchObject({ owner: 'appraise' })
  })
})
