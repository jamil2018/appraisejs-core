import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'

/** Offline compatibility API and receipt provenance remain unchanged. */
export async function createOfflineQualityJourneyRoleDelivery(
  options: Parameters<typeof createManagedQualityJourneyRoleDelivery>[0],
) {
  const managed = await createManagedQualityJourneyRoleDelivery(options)
  return Object.freeze({
    profile: managed.profile,
    profileDigest: managed.profileDigest,
    fence: managed.fence,
    readCommitted: managed.readCommitted,
    async invoke(call: Parameters<typeof managed.invoke>[0]) {
      return (await managed.invoke(call)).receipt
    },
  })
}
