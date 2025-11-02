import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { resolveLocator } from '../../utils/locator.util.js'

When(
    'the user fills in the {string} field with {string}',
    async function (this: CustomWorld, field: string, text: string) {
        try {
            const locator = resolveLocator(this.page, field)
            if (!locator) {
                throw new Error(`Locator ${field} not found`)
            }
            await this.page.fill(locator, text, { timeout: 10000 })
        } catch (error) {
            console.error(error)
        }
    }
)
