import { randomBytes } from 'node:crypto'

const CROCKFORD_BASE32 = '0123456789abcdefghjkmnpqrstvwxyz'
const LEGACY_PLAN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function encodeTime(timestamp: number): string {
  let value = timestamp
  let encoded = ''
  for (let index = 0; index < 10; index += 1) {
    encoded = CROCKFORD_BASE32[value % 32] + encoded
    value = Math.floor(value / 32)
  }
  return encoded
}

function encodeRandom(): string {
  const bytes = randomBytes(10)
  let bits = 0
  let bitCount = 0
  let encoded = ''
  for (const byte of bytes) {
    bits = (bits << 8) | byte
    bitCount += 8
    while (bitCount >= 5 && encoded.length < 16) {
      bitCount -= 5
      encoded += CROCKFORD_BASE32[(bits >> bitCount) & 31]
    }
  }
  return encoded.padEnd(16, '0')
}

export function createOpaquePlanId(): string {
  return `pln_${encodeTime(Date.now())}${encodeRandom()}`
}

export function createPlanSlug(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'plan'
}

export function isLegacyPlanId(value: string): boolean {
  return LEGACY_PLAN_ID_PATTERN.test(value)
}
