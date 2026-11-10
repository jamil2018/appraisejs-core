import type { DiscoveryAuthTransitPolicy } from './discovery-auth-transit-policy'

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
