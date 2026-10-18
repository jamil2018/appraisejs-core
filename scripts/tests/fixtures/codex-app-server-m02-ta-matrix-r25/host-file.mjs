/** Reuse exact accepted host-file identity checks, never process-image attestation. */
export {
  R23_INSTALLED_HOST_FILE as R25_INSTALLED_HOST_FILE,
  verifyR23HostFile as verifyR25HostFile,
  createR23OwnedHostObserver as createR25OwnedHostObserver,
} from '../codex-app-server-m02-ta-matrix-r23/host-file.mjs'
