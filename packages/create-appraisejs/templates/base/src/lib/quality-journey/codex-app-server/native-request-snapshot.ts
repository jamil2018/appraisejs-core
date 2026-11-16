import { types } from 'node:util'

const isProxy = types.isProxy

function refuse(): never {
  throw new Error('Inert native request snapshot required')
}

/** No caller getter, serializer or mutable reference survives into schema/source checks or stdio. */
export function captureNativeRequestSnapshot(params: Record<string, unknown>): Record<string, unknown> {
  let nodes = 0
  const ancestors = new WeakSet<object>()
  function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse()
    return descriptor.value
  }
  function captureArray(descriptors: PropertyDescriptorMap, keys: PropertyKey[], depth: number) {
    const result: unknown[] = []
    // Keep ordinary array behavior while preventing inherited serializers from changing JSON.
    Object.defineProperty(result, 'toJSON', { value: undefined, enumerable: false })
    const length = descriptors.length?.value
    if (!Number.isSafeInteger(length) || length < 0 || length > 16_384 || keys.length !== length + 1) refuse()
    for (let index = 0; index < length; index++) result.push(capture(dataValue(descriptors[String(index)]), depth + 1))
    return result
  }
  function captureRecord(descriptors: PropertyDescriptorMap, keys: PropertyKey[], depth: number) {
    const result: Record<string, unknown> = Object.create(null)
    for (const key of keys as string[]) result[key] = capture(dataValue(descriptors[key]), depth + 1)
    return result
  }
  function captureObject(value: object, depth: number) {
    // Captured native predicate does not invoke reflection traps, including for revoked proxies.
    if (isProxy(value) || ancestors.has(value)) refuse()
    const array = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== (array ? Array.prototype : Object.prototype) && !(prototype === null && !array)) refuse()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some(key => typeof key !== 'string' || key === 'toJSON')) refuse()
    ancestors.add(value)
    const result = array ? captureArray(descriptors, keys, depth) : captureRecord(descriptors, keys, depth)
    ancestors.delete(value)
    return Object.freeze(result)
  }
  function finiteNumber(value: number) {
    if (!Number.isFinite(value)) refuse()
    return value
  }
  function capture(value: unknown, depth: number): unknown {
    if (++nodes > 16_384 || depth > 64) refuse()
    if (value === null) return value
    switch (typeof value) {
      case 'string':
      case 'boolean':
        return value
      case 'number':
        return finiteNumber(value)
      case 'object':
        return captureObject(value, depth)
      default:
        return refuse()
    }
  }
  const snapshot = capture(params, 0)
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) refuse()
  if (Buffer.byteLength(JSON.stringify(snapshot)) > 256 * 1024) refuse()
  return snapshot as Record<string, unknown>
}
