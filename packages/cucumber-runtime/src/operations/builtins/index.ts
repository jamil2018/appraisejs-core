import { activeStateAssertionBuiltins } from './active-state-assertion.ts'
import { browserAssertionBuiltins } from './browser-assertion.ts'
import { browserStateBuiltins } from './browser-state.ts'
import { clickBuiltins } from './click.ts'
import { dataDiagnosticsBuiltins } from './data-diagnostics.ts'
import { downloadAssertionBuiltins } from './download-assertion.ts'
import { downloadsBuiltins } from './downloads.ts'
import { elementPropertyAssertionBuiltins } from './element-property-assertion.ts'
import { elementStateAssertionBuiltins } from './element-state-assertion.ts'
import { formsBuiltins } from './forms.ts'
import { hoverBuiltins } from './hover.ts'
import { inputBuiltins } from './input.ts'
import { keyboardBuiltins } from './keyboard.ts'
import { navigationAssertionBuiltins } from './navigation-assertion.ts'
import { navigationBuiltins } from './navigation.ts'
import { pointerBuiltins } from './pointer.ts'
import { randomDataBuiltins } from './random-data.ts'
import { storeBuiltins } from './store.ts'
import { structuredOperationsBuiltins } from './structured-operations.ts'
import { synchronizationBuiltins } from './synchronization.ts'
import { tabsFramesDialogsBuiltins } from './tabs-frames-dialogs.ts'
import { textAssertionBuiltins } from './text-assertion.ts'
import { visibilityAssertionBuiltins } from './visibility-assertion.ts'
import { waitBuiltins } from './wait.ts'

export const builtinBrowserOperations = [
  ...browserStateBuiltins,
  ...clickBuiltins,
  ...dataDiagnosticsBuiltins,
  ...downloadsBuiltins,
  ...formsBuiltins,
  ...hoverBuiltins,
  ...inputBuiltins,
  ...keyboardBuiltins,
  ...navigationBuiltins,
  ...pointerBuiltins,
  ...randomDataBuiltins,
  ...storeBuiltins,
  ...structuredOperationsBuiltins,
  ...synchronizationBuiltins,
  ...tabsFramesDialogsBuiltins,
  ...waitBuiltins,
  ...activeStateAssertionBuiltins,
  ...browserAssertionBuiltins,
  ...downloadAssertionBuiltins,
  ...elementPropertyAssertionBuiltins,
  ...elementStateAssertionBuiltins,
  ...navigationAssertionBuiltins,
  ...textAssertionBuiltins,
  ...visibilityAssertionBuiltins,
]

export { activeStateAssertionBuiltins } from './active-state-assertion.ts'
export { browserAssertionBuiltins } from './browser-assertion.ts'
export { browserStateBuiltins } from './browser-state.ts'
export { clickBuiltins } from './click.ts'
export { dataDiagnosticsBuiltins } from './data-diagnostics.ts'
export { downloadAssertionBuiltins } from './download-assertion.ts'
export { downloadsBuiltins } from './downloads.ts'
export { elementPropertyAssertionBuiltins } from './element-property-assertion.ts'
export { elementStateAssertionBuiltins } from './element-state-assertion.ts'
export { formsBuiltins } from './forms.ts'
export { hoverBuiltins } from './hover.ts'
export { inputBuiltins } from './input.ts'
export { keyboardBuiltins } from './keyboard.ts'
export { navigationAssertionBuiltins } from './navigation-assertion.ts'
export { navigationBuiltins } from './navigation.ts'
export { pointerBuiltins } from './pointer.ts'
export { randomDataBuiltins } from './random-data.ts'
export { storeBuiltins } from './store.ts'
export { structuredOperationsBuiltins } from './structured-operations.ts'
export { synchronizationBuiltins } from './synchronization.ts'
export { tabsFramesDialogsBuiltins } from './tabs-frames-dialogs.ts'
export { textAssertionBuiltins } from './text-assertion.ts'
export { visibilityAssertionBuiltins } from './visibility-assertion.ts'
export { waitBuiltins } from './wait.ts'
