import { resolveLocator } from '../../locator.util.ts'
import type { SelectorName } from '../../types.ts'
import type { CustomWorld } from '../../world.ts'
import type { BuiltinBrowserOperation } from '../builtin-contracts.ts'

export const downloadsBuiltins = [
  {
    id: 'browser.downloads.click.and.wait.for.download',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'filenameVariable', type: 'STRING' },
      { name: 'pathVariable', type: 'STRING' },
    ],
    execute: async function (
      this: CustomWorld,
      elementName: SelectorName,
      filenameVariable: string,
      pathVariable: string,
    ) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const [download] = await Promise.all([this.page.waitForEvent('download'), this.page.locator(selector).click()])
      const failure = await download.failure()
      if (failure) throw new Error(`Download failed: ${failure}`)
      this.setVar(filenameVariable, download.suggestedFilename())
      this.setVar(pathVariable, (await download.path()) ?? '')
    },
  },
  {
    id: 'browser.downloads.click.and.store.download',
    version: '1',
    parameters: [
      { name: 'elementName', type: 'LOCATOR' },
      { name: 'variableName', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, elementName: SelectorName, variableName: string) {
      const selector = await resolveLocator(this.page, elementName)
      if (!selector) throw new Error(`Selector ${elementName} not found`)
      const [download] = await Promise.all([this.page.waitForEvent('download'), this.page.locator(selector).click()])
      this.setVar(variableName, download)
    },
  },
  {
    id: 'browser.downloads.save.download.to.path',
    version: '1',
    parameters: [
      { name: 'downloadVariable', type: 'STRING' },
      { name: 'targetPath', type: 'STRING' },
    ],
    execute: async function (this: CustomWorld, downloadVariable: string, targetPath: string) {
      const download = this.getVar<{ saveAs(path: string): Promise<void> }>(downloadVariable)
      if (!download || typeof download.saveAs !== 'function') {
        throw new Error(`Stored variable ${downloadVariable} does not contain a Playwright download`)
      }
      await download.saveAs(targetPath)
    },
  },
  {
    id: 'browser.downloads.wait.for.download.event',
    version: '1',
    parameters: [{ name: 'variableName', type: 'STRING' }],
    execute: async function (this: CustomWorld, variableName: string) {
      this.setVar(variableName, await this.page.waitForEvent('download'))
    },
  },
] satisfies readonly BuiltinBrowserOperation[]
