import { createHash } from 'node:crypto'
import path from 'node:path'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { NativeOutcomeReviewControl } from './native-outcome-source'
import { readNativePublicBytes } from './native-credential-topology'
import {
  inspectNativeQualificationPlan,
  verifyNativeQualificationPlan,
  type CapturedNativeQualificationPlan,
} from './native-qualification-contract'

const nativeOutcomeSourceCommit = 'd2c035639366e0bf2c316aa2065c24aabc12bcdc'
// Exact, reviewed public program bodies. These pins establish conditional source semantics only.
export const nativeOutcomeSourceRequirements = Object.freeze({
  'codex-rs/app-server-protocol/src/protocol/common.rs':
    'd6ca7457f3c9f64aeab9045d402fcd2eede73fb2f192dc302e7ff9880a80ac40',
  'codex-rs/app-server-protocol/src/protocol/v1.rs': '6e767472256756ec8262097f32a2b88330a469de4a4879255835c9f99f178139',
  'codex-rs/app-server-protocol/src/protocol/v2/config.rs':
    'a50d4abcd7ea13486e622845f7987720658cb80ac3c15b3c374207659989eb65',
  'codex-rs/app-server-protocol/src/protocol/v2/mcp.rs':
    '71ff45af71302857a5637dee47d8f24b85e8660e145ceb8012d39db432944b12',
  'codex-rs/app-server-protocol/src/protocol/v2/shared.rs':
    '949a38b6ba90e2d4e08cf6723e585ceb46e9d018e0a49bbe184ebf41f5bd7f4e',
  'codex-rs/app-server-protocol/src/protocol/v2/thread.rs':
    '7078523782a03ae0e7b71354bf2d497854777281b449162af2de2a4edea8ee8a',
  'codex-rs/app-server-protocol/src/protocol/v2/turn.rs':
    '198434210e6d0d9b11ddc842e499004a34184185ef19d80a47023056fa9c2a6b',
  'codex-rs/app-server/src/config_manager_service.rs':
    'fa66b3f53f6925aff01f0da4b1d96756e4b253c1de24ca35d2f75194d1553353',
  'codex-rs/app-server/src/extensions.rs': '77c3f26102df8fe6d1d4ea8f0ddfdc5bb60feeeb374434f9ae4a3f8082353b89',
  'codex-rs/app-server/src/lib.rs': '6f2bdcc2fb0319ade12d66e78643eabf31c73dea2b3307173ad309baa15d9da0',
  'codex-rs/app-server/src/message_processor.rs': 'f52ba90ad7d573162f87f5d527c9a71a5053563e9ba443bd8aa349b10c6823be',
  'codex-rs/app-server/src/request_processors/config_processor.rs':
    'b8e3e5d8b3f9410881e882571810029c48da035832b3aef60ba150da92b442b5',
  'codex-rs/app-server/src/request_processors/thread_lifecycle.rs':
    'e6fa3df171a23d128d069fd530184b0545f90a3dfc6f21c36155a6e77c613e5b',
  'codex-rs/app-server/src/request_processors/thread_processor.rs':
    '474604874e02f5ddfa148a65825e6728b7e4be9d5993f28724809b2a36256d52',
  'codex-rs/app-server/src/request_processors/thread_queue_processor.rs':
    '2e2aa119a090fc4da2e7858a06af55be5d2e181679d101c8fd50521d8f584581',
  'codex-rs/app-server/src/thread_sample.rs': '57e8c99a79c9e7f1fbc513d15947095fc11b12c62c2b1f4cf767c0bc519ea145',
  'codex-rs/codex-experimental-api-macros/src/lib.rs':
    '2ea6e4acc01489eca301532b56fb27e0d8792e9b41b00a7657c96b36181b1997',
  'codex-rs/config/src/config_requirements.rs': 'ae9e111a58b1051f3be95105f0a3498363788e5d5a2873a14a36ecfc21c8ad09',
  'codex-rs/config/src/config_toml.rs': '89e8c49221699a16b222f9d2f23574b1fa8d1179ddee81702de684c7fc21c2e8',
  'codex-rs/core/src/agent/control/api.rs': '64184e5f2927f5befbc3f08baefb8dc4ed6d750b541b16d68a5dab2c4225dd46',
  'codex-rs/core/src/agent/control/delivery.rs': 'e5e93d5eb3ca6deb7cf1b1b4914644c0d844324cc30197e5c51c6a5582295a16',
  'codex-rs/core/src/agent/control/mailbox.rs': '3ad60664879f8ee349724c35e0b7e56f12592da4e932225e7957cc071b385ae7',
  'codex-rs/core/src/agent_message_board.rs': '5b2fdfe590e6bd9d2f568bd61bf2850bfebd52b9c40667287900cc26a9fc8eb7',
  'codex-rs/core/src/config/mod.rs': 'c8e0ee2894ae1d17018d931eff47c30e0ef5b13da003238db3cffe04ef7580ff',
  'codex-rs/core/src/session/async_compaction.rs': 'be710a5829b59b437cc61c53188a839bfff3970afd1418dd9aa93998df7adc72',
  'codex-rs/core/src/session/input_queue.rs': '625381827f4f9610ee7bcaf11a5373990e4e914d75dff311c6f27a7cf4fc7412',
  'codex-rs/core/src/session/turn.rs': 'a17fe3aeb5e0dbe57fdebe8b517728aa3cc90da48478098e65b1c091f2a2114e',
  'codex-rs/core/src/state_db_bridge.rs': '008a81a24eecdb9fe3cf915ad002359e30287aed97059bb36ac0963d49d81584',
  'codex-rs/core/src/stream_events_utils.rs': '08028c8dc5aa77852f77eda9a7b1df1cbd491df17dcf58283ff4081a16ee97cd',
  'codex-rs/core/src/tasks/lifecycle.rs': '45c246c98a56e4d262f62058672586aa9a40a55acd3c3c79a940f36e9ce845f6',
  'codex-rs/core/src/tasks/mod.rs': '07ea65dad0d749a989c1325c08d9a24fda16746744851482a77362dc825a8969',
  'codex-rs/core/src/thread_manager.rs': 'f53f69a26bfb0b8b477ecd64f05b457edeb1d33a94bbcff066fa3daa6c357c5f',
  'codex-rs/core/src/tools/handlers/sleep.rs': '210525e50e0463170e43c53e42b6abcac03d41ffcc515b9e109a9c40b09a3c9e',
  'codex-rs/ext/agent-message-board/src/extension.rs':
    '08ff785490e223fb6ac037b84bff15d6cad2cc8b84d790430ca8d704eaed850b',
  'codex-rs/ext/extension-api/src/registry.rs': 'aed4e287533a1a5a7d9cf04a0978bf9018a1818f72b683de1d8ed466a60dae7a',
  'codex-rs/ext/goal/src/extension.rs': '0af11f45975140a0774e2eb6f64c91db4ebbf5fd7515659e4d741b5790784793',
  'codex-rs/ext/goal/src/lib.rs': 'fa0a7632863b05c565318f88dd2ef985a08518c833c57e51e70bf4e976e6562f',
  'codex-rs/ext/goal/src/runtime.rs': '9fd31e79fd06f68e192b799631cfd544b8e685dd7aa4b98b96a02da9e8ff9ea8',
  'codex-rs/ext/queue/src/lib.rs': 'faa932b001c7adcf8466898bdd22b751d5302edcce0c4510eb90c38817542451',
  'codex-rs/ext/queue/src/service.rs': '110253b6c2b74de1ad8610b347ac331479d4f09873a1c8f9793a6921438d6ae1',
  'codex-rs/features/src/lib.rs': '405589acb1994448c2112bc9aa50abf43c71cb015cbf602599f32e69e44b0977',
  'codex-rs/rollout/src/state_db.rs': '22bb1352fffb26b1ca2e2183a7521b7aa1bc458d4fa8054dfa94f385c91a6ad5',
  'codex-rs/state/src/sqlite.rs': '30c2375ce82d94b518c86029ce11db758c06f501fc2ee5e394a61941af5cb753',
})
const digest = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`
export const nativeOutcomeProtocolDigest = digest('M13_ORIGINAL_NATIVE_ORDINARY_COMPLETED_V1')
declare const profileBrand: unique symbol
export type NativeOutcomeProfile = Readonly<{ [profileBrand]: true }>
export type NativeOutcomeProfileRecord = Readonly<{
  planDigest: string
  reviewControlDigest: string
  profileDigest: string
  dossierDigest: string
  artifactDigest: string
  configurationDigest: string
  roleProfileDigest: string
  candidateTree: string
  campaignId: string
  plan: CapturedNativeQualificationPlan
}>
const profiles = new WeakMap<NativeOutcomeProfile, NativeOutcomeProfileRecord>()
const dossierRoots = new WeakMap<NativeOutcomeProfile, string>()
const reviewControls = new WeakMap<NativeOutcomeProfile, NativeOutcomeReviewControl>()
function refuse(): never {
  throw new Error('Exact closed native outcome source profile required')
}
function publicBytes(filename: string, plan: CapturedNativeQualificationPlan, maxBytes = 1024 * 1024) {
  return readNativePublicBytes(filename, inspectNativeQualificationPlan(plan).manifest.credentialSource, maxBytes)
}
/** Capture exact offline dossier bytes, never a caller qualification flag or replacement validator. */
export function captureNativeOutcomeProfile(
  plan: CapturedNativeQualificationPlan,
  dossierRoot: string,
  reviewControl: NativeOutcomeReviewControl,
): NativeOutcomeProfile {
  const { manifest } = verifyNativeQualificationPlan(plan)
  if (!path.isAbsolute(dossierRoot)) refuse()
  const files = Object.entries(nativeOutcomeSourceRequirements).map(([name, expected]) => {
    const actual = digest(publicBytes(path.join(dossierRoot, 'source', name), plan))
    if (actual !== `sha256:${expected}`) refuse()
    return { name, digest: actual }
  })
  assertNativeOutcomeSourceFacts(files.map(file => ({ path: file.name, sha256: file.digest.slice(7) })))
  const treeBytes = publicBytes(path.join(dossierRoot, 'source-tree.json'), plan, 8 * 1024 * 1024)
  const tree = JSON.parse(treeBytes.toString()) as { sha?: string; tree?: Array<{ path: string; sha: string }> }
  if (tree.sha !== nativeOutcomeSourceCommit || !Array.isArray(tree.tree)) refuse()
  for (const name of Object.keys(nativeOutcomeSourceRequirements)) {
    const bytes = publicBytes(path.join(dossierRoot, 'source', name), plan)
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (tree.tree.find(item => item.path === name)?.sha !== blob) refuse()
  }
  const bindingBytes = publicBytes(path.join(dossierRoot, 'static-binding-review.json'), plan)
  const binding = JSON.parse(bindingBytes.toString())
  if (
    binding.decision !== 'ACCEPT_NARROW_STATIC_PROGRAM_BODY_BINDING_ONLY' ||
    binding.sourceCommit !== nativeOutcomeSourceCommit ||
    binding.installedSha256 !== '7cb8700a47be3c81bb3c5efbf2d2adc716ce3db4806e9dc992f2925f78b2b194' ||
    manifest.native.sha256 !== binding.installedSha256
  )
    refuse()
  const receiptNames = [
    'idle-source-fetch.json',
    'queue-source-fetch.json',
    'source-blob-verification.json',
    'c1-final-source-fetch.json',
    'c1-state-home-source-fetch.json',
    'c1-state-home-readback-source-fetch.json',
    'c1-base-rpc-source-fetch.json',
    'c1-approval-policy-source-fetch.json',
  ]
  const receipts = receiptNames.map(name => {
    const bytes = publicBytes(path.join(dossierRoot, name), plan)
    const value = JSON.parse(bytes.toString())
    if (value.commit !== nativeOutcomeSourceCommit || !Array.isArray(value.files)) refuse()
    return { name, bytes, value }
  })
  // Preserve historical entries verbatim in the digest; only required paths participate in closure.
  const fetched = receipts
    .filter(receipt => receipt.name !== 'source-blob-verification.json')
    .flatMap(receipt => receipt.value.files)
  const verified = receipts.find(receipt => receipt.name === 'source-blob-verification.json')!.value
  for (const [name, expected] of Object.entries(nativeOutcomeSourceRequirements)) {
    if (
      !fetched.some(
        (entry: { path: string; sha256: string; status: number }) =>
          entry.path === name && entry.status === 0 && entry.sha256 === expected,
      ) &&
      !(
        verified.allMatchTree === true &&
        verified.files.some(
          (entry: { path: string; sha256: string }) => entry.path === name && entry.sha256 === expected,
        )
      )
    )
      refuse()
  }
  const dossierDigest = digest(
    canonicalContractJson({
      sourceCommit: nativeOutcomeSourceCommit,
      files,
      tree: digest(treeBytes),
      binding: digest(bindingBytes),
      receipts: receipts.map(receipt => ({ name: receipt.name, digest: digest(receipt.bytes) })),
    }),
  )
  const body = {
    planDigest: digest(canonicalContractJson(manifest)),
    reviewControlDigest: digest(canonicalContractJson(reviewControl)),
    dossierDigest,
    artifactDigest: digest(canonicalContractJson(manifest.inputs)),
    configurationDigest: `sha256:${manifest.configurationSha256}`,
    roleProfileDigest: manifest.roleProfileDigest,
    candidateTree: manifest.candidateTree,
    campaignId: manifest.campaignId,
  }
  const profile = Object.freeze({}) as NativeOutcomeProfile
  dossierRoots.set(profile, dossierRoot)
  reviewControls.set(profile, Object.freeze({ ...reviewControl }))
  profiles.set(profile, Object.freeze({ ...body, profileDigest: digest(canonicalContractJson(body)), plan }))
  return profile
}
export function inspectNativeOutcomeProfile(profile: NativeOutcomeProfile): NativeOutcomeProfileRecord {
  const record = profiles.get(profile)
  if (!record) refuse()
  const root = dossierRoots.get(profile)
  if (!root) refuse()
  const current = profiles.get(captureNativeOutcomeProfile(record.plan, root, reviewControls.get(profile)!))!
  if (canonicalContractJson(current) !== canonicalContractJson(record)) refuse()
  return record
}

/** Non-issuing fact check. Only captureNativeOutcomeProfile can create the opaque live profile. */
export function assertNativeOutcomeSourceFacts(observed: readonly Readonly<{ path: string; sha256: string }>[]) {
  if (
    observed.length !== Object.keys(nativeOutcomeSourceRequirements).length ||
    new Set(observed.map(item => item.path)).size !== observed.length
  )
    refuse()
  for (const [name, expected] of Object.entries(nativeOutcomeSourceRequirements)) {
    if (observed.find(item => item.path === name)?.sha256 !== expected) refuse()
  }
}
