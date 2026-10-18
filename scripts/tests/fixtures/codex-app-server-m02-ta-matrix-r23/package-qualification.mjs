/** TA05: qualify one exact current metadata version; never impersonate the old file. */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r22/r21-evidence.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const ROOT_PACKAGE = join(REPO, 'package.json')
export const OLD_PACKAGE_SHA = 'e72dc3831d874e96d346ea1054d93472440decf8512f13e66b0e412da44f3cf4'
export const CURRENT_PACKAGE_SHA = '96c022e3f83bed882040c6f07c73ffca03819c13ad42bae97a2e8e24fe9c0118'
const EVIDENCE = join(REPO, '.appraisejs/m02-ta05-root-package-evidence-01')
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta05-root-package-requalification-01.md')
const DECISION = join(REPO, '.appraisejs/m02-ta05-user-decision-01.json')
const PROPOSAL_SHA = 'a57a8b3bbd5b0eb95345b121d5268092508245d73dfb57d8661dc69e74bb75f7'
const DECISION_SHA = '6b47912fd5f98f4136e54648620660cc6f0ac2bb874b68f3b1af71daa562186d'
const INDEX_SHA = '1a52e04632a53f573724af1611a028700fa5450c176276d5ec0bdc9801b3acfb'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export const SCRIPT_DELTA = Object.freeze({
  'quality:pre-commit': [
    'npm run quality:fallow:commit && npm run quality:react-doctor:commit',
    'node scripts/run-harness-validation.mjs --pre-commit --execute',
  ],
  'check:development-harness': [
    'node --test scripts/tests/harness-*.test.mjs && node scripts/check-harness-matrix.mjs && node scripts/check-harness-learning.mjs',
    'node --test scripts/tests/harness-*.test.mjs scripts/tests/native-harness-pilot.test.mjs && node scripts/check-harness-matrix.mjs && node scripts/check-harness-learning.mjs',
  ],
  'harness:model-currency': [null, 'node scripts/report-harness-model-currency.mjs'],
  'harness:pilot': [null, 'node scripts/harness-pilot.mjs'],
  'harness:pilot:run': [null, 'node scripts/run-native-harness-pilot.mjs'],
})

export function verifyExactPackageDelta(before, after) {
  if (!before?.scripts || !after?.scripts) throw new Error('TA05 scripts missing')
  const a = structuredClone(before),
    b = structuredClone(after)
  delete a.scripts
  delete b.scripts
  if (!isDeepStrictEqual(a, b)) throw new Error('TA05 non-script metadata drift')
  const changed = [...new Set([...Object.keys(before.scripts), ...Object.keys(after.scripts)])]
    .filter(key => before.scripts[key] !== after.scripts[key])
    .sort()
  if (!isDeepStrictEqual(changed, Object.keys(SCRIPT_DELTA).sort())) throw new Error('TA05 script key delta drift')
  for (const [key, [oldValue, currentValue]] of Object.entries(SCRIPT_DELTA)) {
    if (
      (before.scripts[key] ?? null) !== oldValue ||
      after.scripts[key] !== currentValue ||
      (oldValue === null && Object.hasOwn(before.scripts, key))
    )
      throw new Error('TA05 script value drift')
  }
  return Object.freeze(changed)
}

/** The read port is only for disposable, deterministic refusal tests; defaults use stable no-follow reads. */
export async function qualifyRootPackage({ read = readStableFile } = {}) {
  await read(PROPOSAL, PROPOSAL_SHA)
  const decision = JSON.parse(await read(DECISION, DECISION_SHA))
  if (
    decision.schema !== 'appraise.m02-ta05-user-decision/v1' ||
    decision.verdict !== 'APPROVE_TA05_OFFLINE_R23' ||
    decision.runtimeAuthority !== false ||
    decision.scope !== 'EXACT_ROOT_PACKAGE_METADATA_DELTA_ADDITIVE_OFFLINE_R23_ONLY' ||
    decision.proposal?.sha256 !== PROPOSAL_SHA
  )
    throw new Error('TA05 offline authority drift')
  const index = JSON.parse(await read(join(EVIDENCE, 'index.json'), INDEX_SHA))
  if (
    index.schema !== 'appraise.m02-ta05-root-package-evidence/v1' ||
    index.runtimeAuthority !== false ||
    index.historical?.copy !== 'historical-package.json' ||
    index.historical.sha256 !== OLD_PACKAGE_SHA ||
    index.historical.commit !== 'ac758ceaa12330f969b166e6be1d18f7b3dc98c9' ||
    index.historical.evidenceClass !== 'HISTORICAL_GIT_SOURCE_BYTES_NOT_CURRENT_FILE' ||
    index.current?.copy !== 'current-package-snapshot.json' ||
    index.current.sha256 !== CURRENT_PACKAGE_SHA ||
    index.current.commit !== '98b531d6ce6a821e72c73bb7b9e37a95179d9ded' ||
    index.current.evidenceClass !== 'CURRENT_ROOT_FILE_AT_EXACT_NEW_HASH' ||
    index.ta05ProposalSha256 !== PROPOSAL_SHA ||
    index.ta05DecisionSha256 !== DECISION_SHA
  )
    throw new Error('TA05 version evidence drift')
  const historicalPath = join(EVIDENCE, 'historical-package.json')
  const currentSnapshotPath = join(EVIDENCE, 'current-package-snapshot.json')
  const oldBytes = await read(historicalPath, OLD_PACKAGE_SHA)
  const snapshotBytes = await read(currentSnapshotPath, CURRENT_PACKAGE_SHA)
  const currentBytes = await read(ROOT_PACKAGE, CURRENT_PACKAGE_SHA)
  if (
    sha(oldBytes) !== OLD_PACKAGE_SHA ||
    sha(currentBytes) !== CURRENT_PACKAGE_SHA ||
    !snapshotBytes.equals(currentBytes) ||
    oldBytes.length !== index.historical.bytes ||
    currentBytes.length !== index.current.bytes
  )
    throw new Error('TA05 package bytes or lengths drift')
  const changedScriptKeys = verifyExactPackageDelta(JSON.parse(oldBytes), JSON.parse(currentBytes))
  return Object.freeze({
    schema: 'appraise.m02-ta05-qualified-root-package/v1',
    path: ROOT_PACKAGE,
    currentSha256: CURRENT_PACKAGE_SHA,
    predecessorSha256: OLD_PACKAGE_SHA,
    predecessorBytes: {
      path: historicalPath,
      sha256: OLD_PACKAGE_SHA,
      evidenceClass: index.historical.evidenceClass,
      gitCommit: index.historical.commit,
    },
    currentSnapshot: { path: currentSnapshotPath, sha256: CURRENT_PACKAGE_SHA },
    changedScriptKeys,
    nonScriptMetadataIdentical: true,
    proposal: { path: PROPOSAL, sha256: PROPOSAL_SHA },
    decision: { path: DECISION, sha256: DECISION_SHA },
    index: { path: join(EVIDENCE, 'index.json'), sha256: INDEX_SHA },
    runtimeCompatibility: 'UNQUALIFIED',
    runtimeAuthority: false,
  })
}
