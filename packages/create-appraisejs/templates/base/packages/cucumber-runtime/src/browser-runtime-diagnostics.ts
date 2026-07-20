export type BrowserRuntimeIssue = { source: 'console' | 'page' | 'network'; message: string; url?: string }

export class BrowserRuntimeDiagnostics {
  private issues: BrowserRuntimeIssue[] = []

  clear(): void {
    this.issues = []
  }

  record(issue: BrowserRuntimeIssue): void {
    this.issues.push(issue)
  }

  read(source: BrowserRuntimeIssue['source'] | 'console-and-page'): BrowserRuntimeIssue[] {
    return source === 'console-and-page'
      ? this.issues.filter(issue => issue.source === 'console' || issue.source === 'page')
      : this.issues.filter(issue => issue.source === source)
  }

  readAll(): BrowserRuntimeIssue[] {
    return [...this.issues]
  }
}
