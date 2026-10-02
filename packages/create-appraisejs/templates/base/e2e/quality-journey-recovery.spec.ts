import { once } from 'node:events'
import { createServer } from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { spawnOwnedProcessGroup, stopOwnedProcessGroup } from '../src/lib/process/owned-process-stop'
import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import prisma from '../src/config/db-config'
import { createQualityJourney } from '../src/services/coordinator/quality-journey-service'

test('human pause and resume preserve lifecycle identity across a real hub restart @smoke', async ({
  page,
  context,
}) => {
  const targetProjectId = randomUUID()
  await prisma.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `e2e:${targetProjectId}`,
      canonicalPath: `/tmp/${targetProjectId}`,
      displayName: 'Disposable recovery browser test',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const created = await createQualityJourney({
    targetProjectId,
    idempotencyKey: randomUUID(),
    requirement: { objective: 'Verify operational pause recovery without authentication.' },
  })
  const journeyId = created.journey.journeyId
  const initial = await prisma.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = (socket.address() as { port: number }).port
  await new Promise<void>(resolve => socket.close(() => resolve()))
  const localURL = `http://127.0.0.1:${port}`
  async function startHub() {
    const owned = await spawnOwnedProcessGroup(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
      {
        supervisorPath: path.join(process.cwd(), 'scripts/owned-process-supervisor.mjs'),
        cwd: process.cwd(),
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => !!entry[1])),
          DATABASE_URL: process.env.DATABASE_URL!,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        streamLogs: false,
        captureOutput: false,
      },
    )
    try {
      for (let i = 0; i < 100; i++) {
        if (!owned.isRunning) throw new Error('Disposable hub exited before readiness.')
        try {
          if ((await fetch(localURL)).ok) return owned
        } catch {}
        await delay(100)
      }
      throw new Error('Disposable hub did not become ready.')
    } catch (error) {
      await stopOwnedProcessGroup(owned)
      throw error
    }
  }
  let hub = await startHub()
  try {
    await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: localURL }])
    const errors: string[] = []
    const failedRequests: string[] = []
    const downtimeFailures: string[] = []
    let restarting = false
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request => {
      // Next router refresh/reload intentionally aborts outstanding navigation prefetches.
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') {
        const detail = `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`
        ;(restarting ? downtimeFailures : failedRequests).push(detail)
      }
    })
    await page.goto(`${localURL}/quality-journeys/${journeyId}?project=${targetProjectId}`)
    // Card renders a div with an accessible label, so address the explicit control label.
    const panel = page.locator('[aria-label="Journey operational recovery"]')
    await expect(panel.getByRole('button', { name: 'Pause journey', exact: true })).toBeDisabled()
    await panel.getByRole('textbox', { name: 'Pause reason' }).fill('Modeled external host unavailable.')
    await panel.getByRole('button', { name: 'Pause journey', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Resume journey', exact: true })).toBeVisible()
    await expect(panel.getByRole('status')).toContainText('External Codex task status is unknown')
    restarting = true
    const stopped = await stopOwnedProcessGroup(hub)
    expect(stopped.kind).toBe('group_exit_observed')
    hub = await startHub()
    // Leave the old document before ending the deliberate outage observation window.
    await page.goto('about:blank')
    restarting = false
    await page.goto(`${localURL}/quality-journeys/${journeyId}?project=${targetProjectId}`)
    await expect(panel.getByRole('button', { name: 'Resume journey', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Resume journey', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Pause journey', exact: true })).toBeVisible()
    const final = await prisma.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
    expect(final).toMatchObject({ status: 'ACTIVE', stateHash: initial.stateHash, stage: initial.stage })
    expect(final.version).toBe(initial.version + 2)
    expect(
      await prisma.qualityJourneyEvent.count({
        where: { journeyId, eventType: { in: ['OPERATIONAL_PAUSE', 'OPERATIONAL_RESUME'] } },
      }),
    ).toBe(2)
    expect(errors).toEqual([])
    expect(failedRequests).toEqual([])
    expect(downtimeFailures.every(failure => failure.endsWith('net::ERR_CONNECTION_REFUSED'))).toBe(true)
  } finally {
    await stopOwnedProcessGroup(hub)
  }
})
