// Diagnostic comparison only: Prisma Date values and SQLite INTEGER milliseconds written by Prisma.
// No Date.parse/coercion: unexpected storage representations fail the fixture closed.
export function fixtureDateTime(value: unknown): number | null {
  if (value === null) return null
  const milliseconds = value instanceof Date ? value.getTime() : value
  if (typeof milliseconds !== 'number' || !Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new Error('Unexpected fixture DateTime; expected exact nonnegative integer epoch milliseconds')
  return milliseconds
}

// Keep the seven original reads and strict normalization in their original left-to-right order.
export function fixtureOriginalTemporal(
  reservedAt: unknown,
  armed: {
    run: { earliestIntentAt: unknown; unresolvedRetentionAt: unknown }
    intent: { claimExpiresAt: unknown; armedAt: unknown; acknowledgementDueAt: unknown; turnDueAt: unknown }
  },
) {
  return {
    reservedAt: fixtureDateTime(reservedAt),
    run: {
      earliestIntentAt: fixtureDateTime(armed.run.earliestIntentAt),
      unresolvedRetentionAt: fixtureDateTime(armed.run.unresolvedRetentionAt),
    },
    intent: {
      claimExpiresAt: fixtureDateTime(armed.intent.claimExpiresAt),
      armedAt: fixtureDateTime(armed.intent.armedAt),
      acknowledgementDueAt: fixtureDateTime(armed.intent.acknowledgementDueAt),
      turnDueAt: fixtureDateTime(armed.intent.turnDueAt),
    },
  }
}
