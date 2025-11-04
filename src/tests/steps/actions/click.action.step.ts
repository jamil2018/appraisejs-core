import { When } from '@cucumber/cucumber'
import { CustomWorld } from '../../config/executor/world.js'
import { resolveLocator } from '../../utils/locator.util.js'

When(
    'the user clicks on {string}',
    async function (this: CustomWorld, selector: string) {
        try {
            const locator = resolveLocator(this.page, selector)
            if (!locator) {
                throw new Error(`Locator ${selector} not found`)
            }
            await this.page.click(locator, { timeout: 10000 })
        } catch (error) {
            console.error(error)
        }
    }
)
