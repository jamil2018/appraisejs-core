// Installed assertion implementation, not matcher wrappers. No worker/runtime or client imports.
import { chai, JestChaiExpect, JestAsymmetricMatchers, type Assertion, type ExpectStatic } from '@vitest/expect'
export type ServiceFixtureExpect = Pick<ExpectStatic, 'any'> & {
  <T>(actual: T, message?: string): Assertion<T>
}
function assertInstalledExpectation(value: unknown): asserts value is ServiceFixtureExpect {
  if (typeof value !== 'function' || !('any' in value) || typeof value.any !== 'function')
    throw new Error('Installed SERVICE assertion plugins did not expose their original expectation function')
}
export function createServiceMatrixExpect(): ServiceFixtureExpect {
  chai.use(JestChaiExpect)
  chai.use(JestAsymmetricMatchers)
  const expectation: unknown = chai.expect
  assertInstalledExpectation(expectation)
  return expectation
}
