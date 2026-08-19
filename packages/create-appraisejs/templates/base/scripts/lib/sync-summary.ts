export type SummarySection = {
  title: string
  items: string[]
}

/** Prints the bounded readiness summary used by the built-in definition seed. */
export function printSyncSummary(
  metrics: Array<{ label: string; value: number }>,
  sections: SummarySection[] = [],
): void {
  console.log('\n📊 Sync Summary:')
  metrics.forEach(metric => console.log(`   ${metric.label}: ${metric.value}`))
  sections.forEach(section => {
    if (section.items.length === 0) return
    console.log(`\n   ${section.title}:`)
    section.items.forEach((item, index) => console.log(`      ${index + 1}. ${item}`))
  })
}
