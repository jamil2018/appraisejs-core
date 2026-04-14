/**
 * Automation path helpers (no Node fs) and workspace bootstrap (fs).
 * Import from `automation-path-roots` when you only need path strings — avoids pulling fs into the bundle graph.
 */
export * from './automation-path-roots'
export { ensureAutomationWorkspaceReady } from './automation-workspace'
