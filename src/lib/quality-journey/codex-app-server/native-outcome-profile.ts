import { createHash } from 'node:crypto'
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { z } from 'zod'
import { nativeQualificationLossProtocolIdentity } from './native-qualification-loss'
import { nativeStartupPolicyIdentity } from './native-startup-metadata'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { NativeOutcomeReviewControl } from './native-outcome-source'
import { readNativePublicBytes } from './native-credential-topology'
import {
  inspectNativeQualificationPlan,
  verifyNativeQualificationPlan,
  type CapturedNativeQualificationPlan,
} from './native-qualification-contract'

export const nativeOutcomeSourceIdentity = Object.freeze({
  sourceCommit: '226fa88979b1a9d76dc36f339ee9c5fbdb2c8e7f',
  installedSha256: '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b',
  sourceGitTree: 'ef95f6dd78bcba8de5c6aa434551cf74a6bdc1de',
  treeSha256: 'a9371b4fbfe87e6a7a87443f119e9806ac39156026a1179d1258484f01f6d033',
  staticBindingSha256: '9e4bd18c6ae72e615a2b586a0e21f73a315d0188bdc8764677119aba445dde75',
})
// Exact reviewed public program bodies establish conditional source semantics only.
export const nativeOutcomeSourceRequirements = Object.freeze({
  'codex-rs/protocol/src/thread_id.rs': '6f1f15040fd6cd6e63ecedd632fad5d7efd7d9404356d54a22f521157c127b7d',
  'codex-rs/config/src/loader/mod.rs': 'fdd9a7a53dd1427c196e2ec51ea50379fd8b8b8f5ae1d8d20b2b874f80f34cbe',
  'codex-rs/app-server/src/startup_warnings.rs': '10d12a904a0a90d8613315cd92dea1a57e5e76e06c19818e31686b897c96138a',
  'codex-rs/app-server/src/request_processors/account_processor.rs':
    '53f78fd55a2da750065effbc9b0f261ec916b75f4a5faed47a2e6bf027df6151',
  'codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs':
    'fa1e9460a98092dddb7b965e2f76cb03c54e41ba7970114d3f1ff1d4783dfc00',
  'codex-rs/app-server/src/account_notifications.rs':
    '0ddd334e79409f9f0f031c0e7c0fd989f3a95e5ec05a5bbbb4027fa51d36b3ef',
  'codex-rs/app-server/src/request_processors/account_processor/workspace_switching.rs':
    '176fecd4ab34af27edebd3e450ffd32612be08b4c3af4b7dd8d5402e81997aa5',
  'codex-rs/app-server/src/request_processors/initialize_processor.rs':
    '3074d588d6dd18067b4b0b380e4903f1176b4bc3f5d1c650d87694b437b541fd',
  'codex-rs/agent-message-board-host/src/lib.rs': '0328b6afeade780da125bbbc7fb8329a686f862b93e75026353e156106779027',
  'codex-rs/app-server-protocol/src/protocol/common.rs':
    '6b4b0f986a779696cdacaa9075b6b3043f5666ec75db4f57828d709087f508ea',
  'codex-rs/app-server-protocol/src/protocol/v1.rs': '6e767472256756ec8262097f32a2b88330a469de4a4879255835c9f99f178139',
  'codex-rs/app-server-protocol/src/protocol/v2/config.rs':
    'e8c6185e04f24ea3aedac5b1a888efda481da70cd2f9b0b590eb9990fcc5dd72',
  'codex-rs/app-server-protocol/src/protocol/v2/mcp.rs':
    'ad780bfb7116b5893d0a43a286e9dba7a95bfd83a06a399eacc17369ca8ea9cc',
  'codex-rs/app-server-protocol/src/protocol/v2/shared.rs':
    'a62b45d701c69cec897cb045d433265526614d5b8b41bfa5d442169df633dc2c',
  'codex-rs/app-server-protocol/src/protocol/v2/thread.rs':
    'd46ff767c93cca7c8bb795533538646b0e8edb91a6974e5e984357ba380865b2',
  'codex-rs/app-server-protocol/src/protocol/v2/thread_data.rs':
    'e7b466890819f3c3eaa2520a4ad785606571d04eae676505f9678fb49e772963',
  'codex-rs/app-server-protocol/src/protocol/v2/turn.rs':
    '195eff58eda0638696f12a9d09b47bb8b8f7686010215cd1df9090c984a70bdb',
  'codex-rs/app-server/src/config_manager_service.rs':
    'c0ee7aea0b39a9637c87e2fcb30513edb55620560e84a64e977bd2da3da85867',
  'codex-rs/app-server/src/extensions.rs': '3f5a5acbc082ff73b68f054e5d1ccf22fd0382d760ee57b90f7ed7e312c4be08',
  'codex-rs/app-server/src/lib.rs': '53a55bf67a0a089c6ec94142afb610d198dd9ceeb73203db0516b45edb88503a',
  'codex-rs/app-server/src/message_processor.rs': 'ec09ff2f6a6f7a8fdfc769fb8d0738048c26a284839314230a4ac85ad1a7bced',
  'codex-rs/app-server/src/request_processors/config_processor.rs':
    '8066b66c1e4e3f432170cd2124429fc7ced2b97b25e0d3ce0d0bbe38e75017cb',
  'codex-rs/app-server/src/request_processors/thread_lifecycle.rs':
    'e6fa3df171a23d128d069fd530184b0545f90a3dfc6f21c36155a6e77c613e5b',
  'codex-rs/app-server/src/request_processors/thread_processor.rs':
    '79e71ebf940fec219e4ffd96f5421b639b4677f6906c0925aff40c51d68224a8',
  'codex-rs/app-server/src/request_processors/thread_queue_processor.rs':
    '1ef011ed35d5c346763bdfe2ef2adf609531fd0345a3bf5a432ce1777988d289',
  'codex-rs/app-server/src/request_processors/turn_processor.rs':
    '3f25538caa6c51acc20121d77058d8dc3cd71b93d116266e30eaf01183977e01',
  'codex-rs/app-server/src/thread_sample.rs': '947837b95344b461bdc1fd4d537eee989d8fe158bed41689d116adbde5bcdba5',
  'codex-rs/codex-experimental-api-macros/src/lib.rs':
    '2ea6e4acc01489eca301532b56fb27e0d8792e9b41b00a7657c96b36181b1997',
  'codex-rs/config/src/config_requirements.rs': 'a009dcb7edb24eb16a43b0bd633294a04630e456003a39ad768f7bda847b633c',
  'codex-rs/config/src/config_toml.rs': '5f586dc94721ab5cf7b2f98c01436b9a40c7866c6a13f2977cac028a921bf10c',
  'codex-rs/core/src/agent/control/api.rs': '64184e5f2927f5befbc3f08baefb8dc4ed6d750b541b16d68a5dab2c4225dd46',
  'codex-rs/core/src/agent/control/delivery.rs': 'e5e93d5eb3ca6deb7cf1b1b4914644c0d844324cc30197e5c51c6a5582295a16',
  'codex-rs/core/src/agent/control/mailbox.rs': '3ad60664879f8ee349724c35e0b7e56f12592da4e932225e7957cc071b385ae7',
  'codex-rs/core/src/client.rs': '544c428df0ebe2eb7e99bdaf507eb7873d6a8ec8e4e193885b3bfa37a200d03f',
  'codex-rs/core/src/config/mod.rs': 'a56536664f910cfa10cc35f0a0905fb6fe66bfe2cb760e5d06bb9be99544b54c',
  'codex-rs/core/src/session/async_compaction.rs': '34543cc79dd5e291ce87a94d116ec9b0e87a2f786dc7a3cbf1e992f6b8337995',
  'codex-rs/core/src/session/handlers.rs': 'aeb2ea64830f88f6a460a00945b466949d3da846b11038b862a3de92a30835e2',
  'codex-rs/core/src/session/input_queue.rs': '3e30c1c8ee458afefd48f94bfce5dd52aaed0716f834c5f3e17b2383d8ae01d0',
  'codex-rs/core/src/session/mod.rs': '6eecc35de03cb80b3ceb1b5e0e43ff0f8e926d75376bec00219fcb967be1afc8',
  'codex-rs/core/src/session/session.rs': 'd959c8c6e9193e202fb94237e1674fcecaa2e865ca7e38f4937eef78ac5160f2',
  'codex-rs/core/src/session/startup_prewarm.rs': '3f202940441dea00bced415ad12223bb66a99deee3ac746633172bb031636c8f',
  'codex-rs/core/src/session/turn.rs': '27ddd2742f0f69f450cf77542bed7013f336e2e6e163bc4368298ee94e79a91a',
  'codex-rs/core/src/state/session.rs': '337b4a68210d254c6820bc7226092afdaed56163d0e9e93e2acf00e11cb6b270',
  'codex-rs/core/src/state_db_bridge.rs': '008a81a24eecdb9fe3cf915ad002359e30287aed97059bb36ac0963d49d81584',
  'codex-rs/core/src/stream_events_utils.rs': '612e1d8f73245f67ae8b8479c37128bf172951952d934b6cb4bc38342d7ae807',
  'codex-rs/core/src/tasks/lifecycle.rs': '45c246c98a56e4d262f62058672586aa9a40a55acd3c3c79a940f36e9ce845f6',
  'codex-rs/core/src/tasks/mod.rs': '5699b351bbf0e73c8167d1ec759f74c7320eba1fc1fe6c85e4633ef4bf8153e5',
  'codex-rs/core/src/tasks/regular.rs': '07e7350c93a0351ca6f970981743c5e84bf716a334ceef4e6f925e9b6d9b6f1d',
  'codex-rs/core/src/thread_manager.rs': 'c979b658d53a57c4d4dc94adbc61d0e4b26aaaa2612257e42978418a9d381f80',
  'codex-rs/core/src/tools/code_mode/mod.rs': 'ad487da557b6c777d6fefedd00579ce587db0edb47fa365cc6953fef296ad491',
  'codex-rs/core/src/tools/handlers/sleep.rs': '210525e50e0463170e43c53e42b6abcac03d41ffcc515b9e109a9c40b09a3c9e',
  'codex-rs/core/src/tools/mod.rs': 'fd41e0cd66de5ee4f9979f37b16066377cf95303a2231d6f0e143e494934fa6a',
  'codex-rs/core/src/tools/router.rs': 'c178e5687c4a3b1e9fdd5f73076118cb9e17b3c61193fc001cc12b601ffe498a',
  'codex-rs/core/src/tools/spec_plan.rs': 'a89b773ca46a4c85668f1bf9598fbf47c8541b35308133762e01b4c477dc28ae',
  'codex-rs/ext/agent-message-board/src/extension.rs':
    '08ff785490e223fb6ac037b84bff15d6cad2cc8b84d790430ca8d704eaed850b',
  'codex-rs/ext/extension-api/src/registry.rs': 'aed4e287533a1a5a7d9cf04a0978bf9018a1818f72b683de1d8ed466a60dae7a',
  'codex-rs/ext/goal/src/extension.rs': '70409d055848aeb7fdc66d92f88fa42c998219bb46a8adec096bc6beb538f656',
  'codex-rs/ext/goal/src/lib.rs': 'fa0a7632863b05c565318f88dd2ef985a08518c833c57e51e70bf4e976e6562f',
  'codex-rs/ext/goal/src/runtime.rs': '95f5aa8e14c44806059d691b5b970354dcbce9ba874bf43e8fd288e234b9ac30',
  'codex-rs/ext/queue/src/lib.rs': 'faa932b001c7adcf8466898bdd22b751d5302edcce0c4510eb90c38817542451',
  'codex-rs/ext/queue/src/service.rs': '369a2187e5dc5b9ae8ac0d02851cfc2cf54cff4d80ca60f0c2640c213be550b7',
  'codex-rs/features/src/feature_configs.rs': 'c11a331ff31a66b8750026c18ce8ef7b74a34616b8aa9ee6799e4777b5d90aa4',
  'codex-rs/features/src/lib.rs': 'ae5067b54222326863207b2c3f9fdcf08d3476dfb850f9084b9ea34a0eb2d649',
  'codex-rs/rollout/src/state_db.rs': '8efc713593cfb5d524cd74486e2a2355167ffcbb335d39bf1c81020a9a20d7f4',
  'codex-rs/state/src/runtime/queued_items.rs': '3296b37044ebc00e92f47f794b689af469498e8f15b0b8fcec94e4f5bd4761b6',
  'codex-rs/state/src/sqlite.rs': '30c2375ce82d94b518c86029ce11db758c06f501fc2ee5e394a61941af5cb753',
  'codex-rs/thread-store/src/queue_store.rs': '2cce4aef5fbb5a68d5d46b81561e4ada936a8b07e9fd0bec6f65daeebc4796fa',
})
const digest = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`
/** The review control uses the original profile issuer's contract JSON representation. */
export function nativeOutcomeReviewControlDigest(control: NativeOutcomeReviewControl) {
  return digest(canonicalContractJson(control))
}
export const nativeOutcomeProtocolDigest = digest(
  canonicalContractJson({ startup: nativeStartupPolicyIdentity, loss: nativeQualificationLossProtocolIdentity }),
)
// Exact independently accepted actual D3 R3 evidence; these static pins grant no effects allocation.
export const nativeStartupEvidenceRequirements = Object.freeze({
  'observation-review.json': 'ebe0dbe978f69c5da3194e3599481158abe84d8b6b1b0a2505e5667eb5f945bf',
  'execution-observation.json': '3b035760db1c2b1d0286dc60a6ebb9e21c867364a830d96e94cb2ae7561da0ca',
  'manifest.json': '646b2569e627e4309d1b8ad66544529cfa2d5b3f847ba7420b6087c2251c5bd6',
  'packet.json': '7b7931dffabaeb0de433119bbb58fdf7a5af960e1d487c56a650c2f7dd2c0131',
})
/** Non-issuing checks only. Guarded profile capture computes these hashes from public bytes. */
export function assertNativeStartupEvidenceFacts(observed: readonly Readonly<{ path: string; sha256: string }>[]) {
  if (
    observed.length !== Object.keys(nativeStartupEvidenceRequirements).length ||
    new Set(observed.map(item => item.path)).size !== observed.length
  )
    refuse()
  for (const [name, expected] of Object.entries(nativeStartupEvidenceRequirements))
    if (observed.find(item => item.path === name)?.sha256 !== expected) refuse()
}
declare const profileBrand: unique symbol
export type NativeOutcomeProfile = Readonly<{ [profileBrand]: true }>
export type NativeOutcomeProfileRecord = Readonly<{
  protocolDigest: string
  startupEvidenceDigest: string
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
  // Reject aliases through any dossier parent as well as the final file. The descriptor guard
  // independently excludes credential aliases and bounds stable regular-file reads.
  if (realpathSync(filename) !== filename) refuse()
  return readNativePublicBytes(filename, inspectNativeQualificationPlan(plan).manifest.credentialSource, maxBytes)
}
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const gitObject = z.string().regex(/^[a-f0-9]{40}$/)
const sourceFact = z
  .object({
    path: z.string(),
    sha256,
    gitBlob: gitObject,
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(1024 * 1024),
  })
  .strict()
const verificationReceipt = z
  .object({
    version: z.literal('M13_CURRENT_NATIVE_SOURCE_BLOB_VERIFICATION_V1'),
    sourceCommit: gitObject,
    installedSha256: sha256,
    sourceGitTree: gitObject,
    treeSha256: sha256,
    staticBindingSha256: sha256,
    files: z.array(sourceFact.extend({ sourceOrigin: z.string().min(1).max(1024) }).strict()),
  })
  .strict()
const sourceTree = z
  .object({
    sha: gitObject,
    truncated: z.literal(false),
    tree: z.array(
      z
        .object({
          path: z.string().min(1),
          sha: gitObject,
          type: z.enum(['blob', 'tree', 'commit']),
          mode: z.string(),
          size: z.number().int().nonnegative().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
const staticBinding = z
  .object({
    version: z.literal('M13_CURRENT_NATIVE_INDEPENDENT_STATIC_BINDING_REVIEW_V1'),
    decision: z.literal('ACCEPT_NARROW_STATIC_PROGRAM_BODY_BINDING_ONLY'),
    judgment: z.literal('accepted'),
    binding: z.object({ installedSha256: sha256, releaseCommit: gitObject }).passthrough(),
    source: z
      .object({
        treeManifestSha256: sha256,
        treeManifestReportedSha: gitObject,
        treeManifestTruncated: z.literal(false),
        reconstructedRootTreeSha: gitObject,
        commitMetadataTreeSha: gitObject,
        commitMetadataTreeAssociationMatchesReconstructedRoot: z.literal(true),
      })
      .passthrough(),
  })
  .passthrough()
type NativeOutcomeDossierFacts = Readonly<{
  installedSha256: string
  treeSha256: string
  staticBindingSha256: string
  files: readonly Readonly<z.infer<typeof sourceFact>>[]
  tree: unknown
  binding: unknown
  receipt: unknown
}>
function assertDossierIdentity(value: NativeOutcomeDossierFacts, tree: z.infer<typeof sourceTree>) {
  const identity = nativeOutcomeSourceIdentity
  if (
    value.installedSha256 !== identity.installedSha256 ||
    value.treeSha256 !== identity.treeSha256 ||
    value.staticBindingSha256 !== identity.staticBindingSha256 ||
    tree.sha !== identity.sourceCommit
  )
    refuse()
}
function assertDossierStaticBinding(binding: z.infer<typeof staticBinding>) {
  const identity = nativeOutcomeSourceIdentity
  if (
    binding.binding.installedSha256 !== identity.installedSha256 ||
    binding.binding.releaseCommit !== identity.sourceCommit ||
    binding.source.treeManifestSha256 !== identity.treeSha256 ||
    binding.source.treeManifestReportedSha !== identity.sourceCommit ||
    binding.source.reconstructedRootTreeSha !== identity.sourceGitTree ||
    binding.source.commitMetadataTreeSha !== identity.sourceGitTree
  )
    refuse()
}
function assertDossierTreePaths(tree: z.infer<typeof sourceTree>) {
  if (
    new Set(tree.tree.map(entry => entry.path)).size !== tree.tree.length ||
    tree.tree.some(
      entry =>
        path.posix.normalize(entry.path) !== entry.path ||
        entry.path.startsWith('../') ||
        path.posix.isAbsolute(entry.path),
    )
  )
    refuse()
}
function assertDossierSourceBlob(
  file: z.infer<typeof sourceFact>,
  entry: z.infer<typeof sourceTree>['tree'][number] | undefined,
  verification: z.infer<typeof verificationReceipt>['files'][number] | undefined,
) {
  if (
    !entry ||
    !verification ||
    entry.type !== 'blob' ||
    !['100644', '100755'].includes(entry.mode) ||
    entry.sha !== file.gitBlob ||
    entry.size !== file.bytes ||
    verification.gitBlob !== file.gitBlob ||
    verification.bytes !== file.bytes
  )
    refuse()
}
/** Non-issuing metadata check. Capture supplies hashes and Git blobs computed from guarded public bytes. */
export function assertNativeOutcomeDossierFacts(value: NativeOutcomeDossierFacts) {
  const tree = sourceTree.parse(value.tree)
  const binding = staticBinding.parse(value.binding)
  const receipt = verificationReceipt.parse(value.receipt)
  const files = z.array(sourceFact).parse(value.files)
  assertNativeOutcomeSourceFacts(files)
  assertNativeOutcomeSourceFacts(receipt.files)
  assertDossierIdentity(value, tree)
  assertDossierStaticBinding(binding)
  if (
    Object.entries(nativeOutcomeSourceIdentity).some(
      ([key, expected]) => receipt[key as keyof typeof nativeOutcomeSourceIdentity] !== expected,
    )
  )
    refuse()
  assertDossierTreePaths(tree)
  const entries = new Map(tree.tree.map(entry => [entry.path, entry]))
  const verified = new Map(receipt.files.map(entry => [entry.path, entry]))
  for (const file of files) {
    const entry = entries.get(file.path)
    const verification = verified.get(file.path)
    assertDossierSourceBlob(file, entry, verification)
  }
}
/** Capture exact offline dossier bytes, never a caller qualification flag or replacement validator. */
export function captureNativeOutcomeProfile(
  plan: CapturedNativeQualificationPlan,
  dossierRoot: string,
  reviewControl: NativeOutcomeReviewControl,
): NativeOutcomeProfile {
  const { manifest } = verifyNativeQualificationPlan(plan)
  if (!path.isAbsolute(dossierRoot) || path.normalize(dossierRoot) !== dossierRoot) refuse()
  const startupEvidence = Object.keys(nativeStartupEvidenceRequirements).map(name => ({
    path: name,
    sha256: digest(publicBytes(path.join(dossierRoot, 'startup-policy', name), plan)).slice(7),
  }))
  assertNativeStartupEvidenceFacts(startupEvidence)
  const files = Object.keys(nativeOutcomeSourceRequirements).map(name => {
    const bytes = publicBytes(path.join(dossierRoot, 'source', name), plan)
    return {
      path: name,
      sha256: digest(bytes).slice(7),
      gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      bytes: bytes.length,
    }
  })
  const treeBytes = publicBytes(path.join(dossierRoot, 'source-tree.json'), plan, 8 * 1024 * 1024)
  const bindingBytes = publicBytes(path.join(dossierRoot, 'static-binding-review.json'), plan)
  const receiptBytes = publicBytes(path.join(dossierRoot, 'source-blob-verification-v1.json'), plan)
  assertNativeOutcomeDossierFacts({
    installedSha256: manifest.native.sha256,
    treeSha256: digest(treeBytes).slice(7),
    staticBindingSha256: digest(bindingBytes).slice(7),
    files,
    tree: JSON.parse(treeBytes.toString()),
    binding: JSON.parse(bindingBytes.toString()),
    receipt: JSON.parse(receiptBytes.toString()),
  })
  const dossierDigest = digest(
    canonicalContractJson({
      ...nativeOutcomeSourceIdentity,
      files,
      receipt: digest(receiptBytes),
    }),
  )
  const body = {
    protocolDigest: nativeOutcomeProtocolDigest,
    startupEvidenceDigest: digest(
      canonicalContractJson({
        files: startupEvidence,
        policySha256: '857508227b92edb67f7e6954bf52b900d3f3246c019f8df93889ff78aef95a2d',
        policyReviewSha256: '78f64ed05e2ebd3b1d93609bd853af8b86587f8593dd36a7eba065d4b1e66724',
        planPresence: 'SCHEMA_VALUE',
      }),
    ),
    planDigest: digest(canonicalContractJson(manifest)),
    reviewControlDigest: nativeOutcomeReviewControlDigest(reviewControl),
    dossierDigest,
    artifactDigest: digest(
      canonicalContractJson(
        manifest.codeMode ? { inputs: manifest.inputs, codeMode: manifest.codeMode } : manifest.inputs,
      ),
    ),
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
