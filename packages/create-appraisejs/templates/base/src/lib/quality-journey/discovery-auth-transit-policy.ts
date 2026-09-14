import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'

const discoveryAuthTransitSchemaVersion = 'appraise.discovery-auth-transit/v1' as const

type PathRule = { match: 'EXACT' | 'SEGMENT_PREFIX'; value: string }
type TransitRule = {
  documentOrigin: '$TARGET' | string
  destinationOrigin: '$TARGET' | string
  path: PathRule
  methods: Array<'GET' | 'HEAD' | 'POST'>
  requestKinds: Array<'DOCUMENT' | 'SUBRESOURCE' | 'XHR_FETCH'>
}
type ReturnRule = { fromOrigin: string; targetPath: string; methods: Array<'GET' | 'POST'> }
export type DiscoveryAuthTransitPolicy = {
  schemaVersion: typeof discoveryAuthTransitSchemaVersion
  flows: Array<{ flowId: string; rules: TransitRule[]; returns: ReturnRule[] }>
}

function canonicalHttpsOrigin(value: string) {
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Not an exact HTTPS origin.')
  return parsed.origin
}

function canonicalAbsolutePath(value: string) {
  const prohibited = ['\\', '?', '#', '//']
  const ambiguousEncoding = /%2f|%5c|%25|%2e/i
  const dotSegment = /(^|\/)\.\.?($|\/)/
  if (
    !value.startsWith('/') ||
    prohibited.some(token => value.includes(token)) ||
    ambiguousEncoding.test(value) ||
    dotSegment.test(value)
  )
    throw new Error('Not a canonical absolute path.')
  const parsed = new URL(value, 'https://policy.invalid')
  if (parsed.pathname !== value || parsed.search || parsed.hash) throw new Error('Not a canonical absolute path.')
  return value
}

function canonicalArray<T extends string>(values: T[]) {
  return [...new Set(values)].toSorted()
}

const rawOrigin = z.union([z.literal('$TARGET'), z.string().trim().min(1).max(2_000)])
const rawTransitRuleSchema = z
  .object({
    documentOrigin: rawOrigin,
    destinationOrigin: rawOrigin,
    path: z.object({ match: z.enum(['EXACT', 'SEGMENT_PREFIX']), value: z.string().trim().min(1).max(2_000) }).strict(),
    methods: z
      .array(z.enum(['GET', 'HEAD', 'POST']))
      .min(1)
      .max(3),
    requestKinds: z
      .array(z.enum(['DOCUMENT', 'SUBRESOURCE', 'XHR_FETCH']))
      .min(1)
      .max(3),
  })
  .strict()
const rawReturnRuleSchema = z
  .object({
    fromOrigin: z.string().trim().min(1).max(2_000),
    targetPath: z.string().trim().min(1).max(2_000),
    methods: z
      .array(z.enum(['GET', 'POST']))
      .min(1)
      .max(2),
  })
  .strict()
const rawPolicySchema = z
  .object({
    schemaVersion: z.literal(discoveryAuthTransitSchemaVersion),
    flows: z
      .array(
        z
          .object({
            flowId: z
              .string()
              .trim()
              .min(1)
              .max(128)
              .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
            rules: z.array(rawTransitRuleSchema).min(1).max(64),
            returns: z.array(rawReturnRuleSchema).min(1).max(16),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict()

function canonicalRule(rule: z.infer<typeof rawTransitRuleSchema>): TransitRule {
  return {
    documentOrigin: rule.documentOrigin === '$TARGET' ? '$TARGET' : canonicalHttpsOrigin(rule.documentOrigin),
    destinationOrigin: rule.destinationOrigin === '$TARGET' ? '$TARGET' : canonicalHttpsOrigin(rule.destinationOrigin),
    path: { match: rule.path.match, value: canonicalAbsolutePath(rule.path.value) },
    methods: canonicalArray(rule.methods),
    requestKinds: canonicalArray(rule.requestKinds),
  }
}

function canonicalReturn(rule: z.infer<typeof rawReturnRuleSchema>): ReturnRule {
  return {
    fromOrigin: canonicalHttpsOrigin(rule.fromOrigin),
    targetPath: canonicalAbsolutePath(rule.targetPath),
    methods: canonicalArray(rule.methods),
  }
}

function byCanonical<T>(values: T[], key: (value: T) => string) {
  const unique = new Map(values.map(value => [key(value), value]))
  return [...unique.values()].toSorted((left, right) => key(left).localeCompare(key(right)))
}

export function parseDiscoveryAuthTransitPolicy(value: unknown, targetOrigin: string): DiscoveryAuthTransitPolicy {
  const raw = rawPolicySchema.parse(value)
  const target = new URL(targetOrigin).origin
  const flows = raw.flows.map(flow => {
    const rules = byCanonical(flow.rules.map(canonicalRule), rule => canonicalContractJson(rule))
    const returns = byCanonical(flow.returns.map(canonicalReturn), rule => canonicalContractJson(rule))
    if (
      rules.some(
        rule =>
          (rule.documentOrigin !== '$TARGET' && rule.documentOrigin === target) ||
          (rule.destinationOrigin !== '$TARGET' && rule.destinationOrigin === target),
      ) ||
      returns.some(rule => rule.fromOrigin === target)
    )
      throw new Error('Static identity-provider origin duplicates the target origin.')
    return { flowId: flow.flowId, rules, returns }
  })
  if (new Set(flows.map(flow => flow.flowId)).size !== flows.length) throw new Error('Flow IDs must be unique.')
  return {
    schemaVersion: discoveryAuthTransitSchemaVersion,
    flows: flows.toSorted((left, right) => left.flowId.localeCompare(right.flowId)),
  }
}

export function normalizeDiscoveryAuthTransitPolicyJson(value: string | null | undefined, targetOrigin: string) {
  if (!value?.trim()) return null
  return canonicalContractJson(parseDiscoveryAuthTransitPolicy(JSON.parse(value), targetOrigin))
}

export function discoveryAuthTransitPolicyHash(value: string | null | undefined) {
  return `sha256:${createHash('sha256')
    .update(value ?? 'null')
    .digest('hex')}`
}

export function identityProviderOriginsFromDiscoveryAuthTransitPolicy(value: string | null | undefined) {
  if (!value) return []
  try {
    const policy = JSON.parse(value) as DiscoveryAuthTransitPolicy
    return [
      ...new Set(
        policy.flows
          .flatMap(flow => [
            ...flow.rules.flatMap(rule => [rule.documentOrigin, rule.destinationOrigin]),
            ...flow.returns.map(rule => rule.fromOrigin),
          ])
          .filter(origin => origin !== '$TARGET'),
      ),
    ].toSorted()
  } catch {
    return []
  }
}

export function resolveDiscoveryAuthTransitOrigin(value: '$TARGET' | string, targetOrigin: string) {
  return value === '$TARGET' ? targetOrigin : value
}

export function discoveryAuthTransitPathMatches(path: PathRule, value: string) {
  return path.match === 'EXACT' ? path.value === value : value === path.value || value.startsWith(`${path.value}/`)
}
