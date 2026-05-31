import type { CompanionSessionFile } from './types.js'
export declare function getLocatorPickerRootDir(repoRoot?: string): string
export declare function getLocatorPickerSessionsDir(repoRoot?: string): string
export declare function getLocatorPickerProfilesDir(repoRoot?: string): string
export declare function getLocatorPickerLogsDir(repoRoot?: string): string
export declare function getLocatorPickerProfileDir(sessionId: string, repoRoot?: string): string
export declare function getLocatorPickerRuntimeDir(repoRoot?: string): string
export declare function getLocatorPickerRuntimeHomeDir(repoRoot?: string): string
export declare function getLocatorPickerRuntimeEnv(repoRoot?: string, baseEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
export declare function getLocatorPickerSessionFilePath(sessionId: string, repoRoot?: string): string
export declare function getLocatorPickerCrashLogPath(sessionId: string, repoRoot?: string): string
export declare function removeLocatorPickerProfileDir(sessionId: string, repoRoot?: string): Promise<void>
export declare function removeLocatorPickerSessionFile(sessionId: string, repoRoot?: string): Promise<void>
export declare function clearLocatorPickerCrashLogs(repoRoot?: string): Promise<void>
export declare function createLocatorPickerCrashLog(logFilePath: string): Promise<void>
export declare function appendLocatorPickerCrashLog(logFilePath: string, message: string): Promise<void>
export declare function ensureLocatorPickerDirectories(repoRoot?: string): Promise<void>
export declare function readLocatorPickerSessionFile(sessionFilePath: string): Promise<CompanionSessionFile | null>
export declare function writeLocatorPickerSessionFile(
  sessionFilePath: string,
  session: Omit<CompanionSessionFile, 'updatedAt'> & {
    updatedAt?: string
  },
): Promise<CompanionSessionFile>
export declare function patchLocatorPickerSessionFile(
  sessionFilePath: string,
  patch:
    | Partial<CompanionSessionFile>
    | ((current: CompanionSessionFile) => Partial<CompanionSessionFile> | CompanionSessionFile),
): Promise<CompanionSessionFile | null>
