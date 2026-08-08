import assert from 'node:assert/strict'
import { readEditorTarget, stopEditorTarget } from '../editor-target.mjs'

// fallow-ignore-next-line code-duplication
const { child, response, page } = await readEditorTarget(import.meta.dirname)
try {
  assert.equal(response.status, 200)
  assert.match(page, /aria-label="Notebook editor"/)
  assert.match(page, /data-save-status="saved"/)
  assert.match(page, /<textarea id="document"/)
  process.stdout.write('QUALIFICATION_PASSED editor-spa\n')
} finally {
  await stopEditorTarget(child)
}
