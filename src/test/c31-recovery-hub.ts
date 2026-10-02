/** Disposable service-host fault injection. This is not a product transport. */
import { PrismaClient } from '@prisma/client'
import { pauseQualityJourneyOperational } from '@/services/coordinator/quality-journey-recovery-service'

const client = new PrismaClient({ datasources: { db: { url: `file:${process.argv[2]}` } } })
const mode = process.argv[3]
process.on('message', async (input: Parameters<typeof pauseQualityJourneyOperational>[0]) => {
  try {
    if (mode === 'drop-reply') {
      await pauseQualityJourneyOperational(input, client)
      await client.$disconnect()
      // The mutation committed, but the caller never receives its reply.
      process.exit(0)
    }
    const result = await pauseQualityJourneyOperational(input, client)
    process.send?.({ phase: 'RECOVERED', result })
    await client.$disconnect()
    process.exit(0)
  } catch {
    process.send?.({ phase: 'FAILED' })
    await client.$disconnect()
    process.exit(1)
  }
})
process.send?.({ phase: 'READY' })
