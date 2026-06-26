#!/usr/bin/env tsx

import { syncPlans } from '../src/lib/plans/plan-sync-service'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

// This thin CLI adapter only maps service counters to console output and exit status.
// fallow-ignore-next-line complexity
async function main() {
  const result = await syncPlans()
  printSyncSummary([
    { label: '📁 Plans scanned', value: result.scanned },
    { label: '✅ Plans existing', value: result.existing },
    { label: '➕ Plans created', value: result.created },
    { label: '🔄 Plans updated', value: result.updated },
    { label: '🗑️  Plans deleted', value: result.deleted },
    { label: '❌ Errors', value: result.errors },
  ])
  if (result.stale > 0) console.warn(`${result.stale} plan projection(s) remain visible with stale data.`)
  if (result.conflicted > 0)
    console.warn(`${result.conflicted} plan(s) contain merge conflicts; progression is disabled.`)
  if (result.reducedAssurance) console.warn('Non-Git plan snapshots are active with reduced assurance.')
  if (result.issues.length > 0) {
    console.warn('\nPlan sync issues:')
    for (const issue of result.issues) {
      const location = issue.artifactPath ? ` (${issue.artifactPath})` : ''
      const projection = issue.projected ? 'last valid projection retained' : 'no projection available'
      console.warn(`- ${issue.planId}${location}: ${issue.message} [${issue.code}; ${projection}]`)
    }
  }
  return {
    errors: result.errors > 0 ? [`${result.errors} plan artifact set(s) could not be projected`] : [],
  }
}

runSyncScript(main)
