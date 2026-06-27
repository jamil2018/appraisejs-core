export function dispatchTestRunExit(testRunId: string) {
  window.dispatchEvent(
    new CustomEvent('testrun:exit', {
      detail: { testRunId },
    }),
  )
}
