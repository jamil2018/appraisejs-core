import prisma from '../../src/config/db-config'

/**
 * Wraps sync script execution with standardized success/error logging,
 * exit code handling, and Prisma disconnection in finally.
 */
export async function runSyncScript(run: () => Promise<{ errors: string[] } | void>): Promise<void> {
  try {
    const result = await run()
    if (!result || result.errors.length === 0) {
      console.log('\n✅ Sync completed successfully!')
      return
    }

    console.log('\n⚠️  Sync completed with errors. Please review the errors above.')
    process.exit(1)
  } catch (error) {
    console.error('\n❌ Error during sync:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}
