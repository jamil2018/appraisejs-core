import assert from 'node:assert/strict'
import { readEditorTarget, stopEditorTarget } from '../editor-target.mjs'

// fallow-ignore-next-line code-duplication
const { child, response, page } = await readEditorTarget(import.meta.dirname)
try {
  assert.equal(response.status, 200)
  assert.match(page, /aria-label="Notebook editor"/)
  assert.match(page, /data-save-status="saved"/, 'QUALIFICATION_PRODUCT_FAILURE expected saved editor state')
} finally {
  await stopEditorTarget(child)
}
