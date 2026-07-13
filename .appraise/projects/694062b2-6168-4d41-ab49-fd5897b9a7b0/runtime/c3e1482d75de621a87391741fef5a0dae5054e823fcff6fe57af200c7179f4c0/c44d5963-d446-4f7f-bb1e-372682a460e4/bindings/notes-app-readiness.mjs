import { Given, When, Then, expect } from 'file:///Users/jamil/Personal%20Projects/appraisejs/packages/cucumber-runtime/dist/index.js'

const cases = [{"caseId":"ast-09a7ff6bbaef-load-notes-app","steps":[{"action":"browser.navigation.goto@1","id":"ast-3ded9c49ab2320fa99b7-step","keywordText":"When the user opens the notes app","parameters":[{"name":"url","value":"/"}]},{"action":"browser.waits.page-ready@1","id":"ast-3455682164c9b19f3694-step","keywordText":"Then the page becomes ready","parameters":[]},{"action":"browser.navigation.reload@1","id":"ast-5d2c716d8976c8afb6c4-step","keywordText":"When the user reloads the notes app","parameters":[]},{"action":"browser.waits.page-ready@1","id":"ast-0159e1c825765a4c6672-step","keywordText":"Then the page becomes ready again","parameters":[]}]}]
const selectors = {}
const registrations = { Given, When, Then, And: Given }
const valueOf = parameters => Object.fromEntries(parameters.map(parameter => [parameter.name, parseValue(parameter.value)]))
const parseValue = value => {
  try { return JSON.parse(value) } catch { return value }
}
const locatorName = parameter => parameter?.locatorName ?? parseValue(parameter?.value ?? '')?.id
const target = async (world, parameter) => {
  const selector = selectors[locatorName(parameter)]
  if (!selector) throw new Error('Reviewed locator could not be resolved.')
  return world.page.locator(selector)
}
const dispatch = async (world, step) => {
  const inputs = valueOf(step.parameters)
  switch (step.action) {
    case 'browser.navigation.goto@1': {
      const destination = new URL(String(inputs.url), process.env.APPRAISE_BASE_URL ?? 'http://localhost').toString()
      await world.page.goto(destination)
      return
    }
    case 'browser.navigation.reload@1': await world.page.reload(); return
    case 'browser.mouse.click@1': await (await target(world, step.parameters.find(item => item.name === 'target'))).click(); return
    case 'browser.forms.fill@1': await (await target(world, step.parameters.find(item => item.name === 'target'))).fill(String(inputs.value)); return
    case 'browser.waits.page-ready@1': await world.page.waitForLoadState('domcontentloaded'); return
    case 'browser.waits.duration@1': await world.page.waitForTimeout(Number(inputs.duration) * 1000); return
    case 'browser.waits.timeout@1': await world.page.waitForTimeout(Number(inputs.timeout)); return
    case 'browser.assertions.visible@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isVisible()).to.equal(true); return
    case 'browser.assertions.accessible@1': {
      const locator = await target(world, step.parameters.find(item => item.name === 'target'))
      expect((await locator.getAttribute('aria-label')) ?? (await locator.textContent()) ?? '').not.to.equal('')
      return
    }
    case 'browser.assertions.persisted@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isVisible()).to.equal(true); return
    default: throw new Error(`Frozen action binding is unsupported: ${step.action}`)
  }
}
for (const testCase of cases) for (const step of testCase.steps) {
  const keyword = step.keywordText.slice(0, step.keywordText.indexOf(' '))
  const expression = step.keywordText.slice(step.keywordText.indexOf(' ') + 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  registrations[keyword](new RegExp(`^${expression}$`), async function () { await dispatch(this, step) })
}
