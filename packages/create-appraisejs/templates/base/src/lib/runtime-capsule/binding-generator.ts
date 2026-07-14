import { canonicalRuntimeCapsuleJson } from './contracts'

export function generateExecutableBindings(input: {
  bindings: unknown
  selectors: Record<string, string>
  runtimeImport: string
}) {
  return `import { Given, When, Then, expect } from '${input.runtimeImport}'

const cases = ${canonicalRuntimeCapsuleJson(input.bindings)}
const selectors = ${canonicalRuntimeCapsuleJson(input.selectors)}
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
    case 'browser.keyboard.press@1': await world.page.keyboard.press(String(inputs.key)); return
    case 'browser.keyboard.focus@1': await (await target(world, step.parameters.find(item => item.name === 'target'))).focus(); return
    case 'browser.viewport.set@1': await world.page.setViewportSize({ width: Number(inputs.width), height: Number(inputs.height) }); return
    case 'browser.waits.page-ready@1': await world.page.waitForLoadState('domcontentloaded'); return
    case 'browser.waits.duration@1': await world.page.waitForTimeout(Number(inputs.duration) * 1000); return
    case 'browser.waits.timeout@1': await world.page.waitForTimeout(Number(inputs.timeout)); return
    case 'browser.assertions.visible@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isVisible()).to.equal(true); return
    case 'browser.assertions.hidden@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isVisible()).to.equal(false); return
    case 'browser.assertions.checked@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isChecked()).to.equal(Boolean(inputs.checked)); return
    case 'browser.assertions.value@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).inputValue()).to.equal(String(inputs.value)); return
    case 'browser.assertions.text@1': expect((await (await target(world, step.parameters.find(item => item.name === 'target'))).textContent()) ?? '').to.contain(String(inputs.text)); return
    case 'browser.assertions.no-horizontal-overflow@1': expect(await world.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).to.equal(true); return
    case 'browser.assertions.accessible@1': {
      const locator = await target(world, step.parameters.find(item => item.name === 'target'))
      const accessibleName = await locator.evaluate(element => {
        const labelledBy = element.getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent ?? '')
          .join(' ')
        const labels = 'labels' in element
          ? Array.from(element.labels ?? []).map(label => label.textContent ?? '').join(' ')
          : ''
        return [
          element.getAttribute('aria-label'),
          labelledBy,
          labels,
          element.getAttribute('alt'),
          element.getAttribute('title'),
          element.getAttribute('placeholder'),
          element.textContent,
        ].find(value => value?.trim()) ?? ''
      })
      expect(accessibleName).not.to.equal('')
      return
    }
    case 'browser.assertions.persisted@1': expect(await (await target(world, step.parameters.find(item => item.name === 'target'))).isVisible()).to.equal(true); return
    default: throw new Error(\`Frozen action binding is unsupported: \${step.action}\`)
  }
}
for (const testCase of cases) for (const step of testCase.steps) {
  const keyword = step.keywordText.slice(0, step.keywordText.indexOf(' '))
  const expression = step.keywordText.slice(step.keywordText.indexOf(' ') + 1).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
  registrations[keyword](new RegExp(\`^\${expression}$\`), async function () { await dispatch(this, step) })
}
`
}
