# Original assignment credential custody

This internal offline-tested component preserves Appraise assignment credentials across claim, bind and admission reply
loss. It does not handle provider-login credentials, discover an account, authorize a new attempt or activate dispatch.
The [offline implementation plan](../tasks/codex-app-server-journeys/M13-OFFLINE-IMPLEMENTATION-PLAN.md) records scope.

`createAssignmentCredentialCustody` encrypts the original claim request/key and assignment secret with AES-256-GCM
using an explicitly injected application key. Authenticated scope includes the database identity, Journey/target,
coordinator session/generation/principal, role and exact original claim request. PREPARED_CLAIM is durable before claim;
CAS binds the exact returned work item, attempt, assignment/generation and lease. A verifier cannot reconstruct a secret.

The coordinator custody service additionally derives identity from the explicit client's main SQLite file, resolved
path/device/inode. It rechecks that identity around asynchronous operations. Another client on the same original file
can recover; a cloned database with the same declared label, path replacement or missing original file refuses. These
are application checks in the trusted-local-agent profile, not OS containment or hostile same-user isolation.

The filesystem backend accepts an explicitly supplied private root, uses restrictive modes and exclusive/CAS writes,
syncs durable data, rejects symlinks/hardlinks/ownership or identity drift, and deletes only proven original temporary
files/locks. It stores ciphertext, never a plaintext key or secret. Unknown/stale ownership is not cleanup permission.
No default root, key file, environment key, keychain lookup, credential export or provider authentication fallback exists.

`claimAndBind`, `recoverClaim` and explicit `admitOriginal` reuse only original material and canonical services.
`withRecoveredBinding` validates current admitted authority before handing material to a trusted in-process callback;
model arguments and receipts never receive it. Missing keys/records, corrupt ciphertext, scope mismatch and conflicting
CAS operations park/refuse the original attempt. They cannot mint a substitute secret, new attempt, send permit,
physical outcome proof, hub release or lifecycle approval. Exact admission replay uses its stable original identity.

Tests use synthetic keys/secrets, fresh private roots and migrated disposable SQLite only. They cover record/claim/bind/
admission reply loss, concurrent writers, Unicode/size bounds, cloned/replaced files, absent keys and stale authority.
Real key provisioning and real credential-store activation remain unconfigured/unqualified. All custody receipts retain
`OFFLINE_ASSIGNMENT_CUSTODY` and `runtimeQualified=false`; encryption does not establish host isolation.
