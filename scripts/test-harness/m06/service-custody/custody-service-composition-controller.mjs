// Separate fresh16z allocation only; never enters the old26 or fresh17 matrices.
import { runServiceController } from './custody-service-controller-main.mjs'
import { compositionServiceCases } from './custody-service-composition-selection.ts'
runServiceController(compositionServiceCases)
