/** Reuse exact accepted host-file identity checks, never process-image attestation. */
export {
  R23_INSTALLED_HOST_FILE as R24_INSTALLED_HOST_FILE,
  verifyR23HostFile as verifyR24HostFile,
  createR23OwnedHostObserver as createR24OwnedHostObserver,
} from '../codex-app-server-m02-ta-matrix-r23/host-file.mjs'
