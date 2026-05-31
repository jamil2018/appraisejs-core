export declare function getLocatorPickerCompanionPaths(repoRoot?: string): {
  packageRoot: string
  sourceRoot: string
  distCliPath: string
  tsconfigPath: string
  tscCliPath: string
}
export declare function resolveLocatorPickerCompanionInvocation(
  cliArgs: string[],
  repoRoot?: string,
): Promise<{
  command: string
  args: string[]
}>
