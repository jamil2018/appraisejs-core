import { verifySavedEditorTarget } from '../editor-target.mjs'

await verifySavedEditorTarget(import.meta.dirname)
process.stdout.write('QUALIFICATION_PASSED editor-spa\n')
