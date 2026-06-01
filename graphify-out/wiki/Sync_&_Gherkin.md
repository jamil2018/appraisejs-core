# Sync & Gherkin

> 28 nodes · cohesion 0.14

## Key Concepts

- **route.ts** (21 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **resolveStoredPath()** (16 connections) — `src/lib/automation/automation-path-roots.ts`
- **route.ts** (8 connections) — `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.ts`
- **addDownloadArtifacts()** (7 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **GET()** (7 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **addLegacyLogFile()** (5 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **addLegacyReportFile()** (5 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **addLegacyTraceFiles()** (5 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **addStoredArtifactFile()** (5 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **route.ts** (5 connections) — `src/app/api/reports/steps/[stepId]/screenshot/route.ts`
- **isPathWithinDirectory()** (4 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **route.test.ts** (4 connections) — `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.test.ts`
- **createZipArchive()** (3 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **GET()** (3 connections) — `src/app/api/reports/steps/[stepId]/screenshot/route.ts`
- **route.test.ts** (3 connections) — `src/app/api/reports/steps/[stepId]/screenshot/route.test.ts`
- **POST()** (3 connections) — `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.ts`
- **archiver** (2 connections) — `package.json`
- **addRunArtifactFiles()** (2 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **collectRunArtifactFiles()** (2 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **createZipDownloadResponse()** (2 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **finalizeArchive()** (2 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **getDownloadTestRun()** (2 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **GET()** (2 connections) — `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.ts`
- **Archive** (1 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- **ArtifactFile** (1 connections) — `src/app/api/test-runs/[runId]/download/route.ts`
- *... and 3 more nodes in this community*

## Relationships

- [[Templates & Flow Builder (35)]] (104 shared connections)
- [[Test Runs (18)]] (6 shared connections)
- [[Shared UI Components (115)]] (3 shared connections)
- [[Locators & Picker (91)]] (2 shared connections)
- [[Locators & Picker (6)]] (2 shared connections)
- [[Test Runs (119)]] (2 shared connections)
- [[Test Runs (19)]] (2 shared connections)
- [[Dashboard & Metrics]] (1 shared connections)
- [[Locators & Picker (4)]] (1 shared connections)

## Source Files

- `package.json`
- `src/app/api/reports/steps/[stepId]/screenshot/route.test.ts`
- `src/app/api/reports/steps/[stepId]/screenshot/route.ts`
- `src/app/api/test-runs/[runId]/download/route.ts`
- `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.test.ts`
- `src/app/api/test-runs/[runId]/trace/[testCaseId]/route.ts`
- `src/lib/automation/automation-path-roots.ts`

## Audit Trail

- EXTRACTED: 121 (98%)
- INFERRED: 2 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*