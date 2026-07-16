# appraisejs

AppraiseJS command-line, coordinator client, MCP server, managed-run diagnostics, and published template-step
registry for an existing Appraise project.

## Quick Start

```bash
npx appraisejs@latest add step <group-slug>/<step-slug>
```

Example:

```bash
npx appraisejs@latest add step click/click-element
```

## Managed Run Diagnostics

The CLI connects to the Appraise hub and exposes selected-target, bounded diagnostics in human or exact JSON form:

```bash
appraisejs test-run diagnose --run-id <run-id>
appraisejs test-run diagnose --run-id <run-id> --json
```

Managed capsule output contains stable status, blocker, evidence, and recovery fields without raw paths, commands,
environment values, or artifact contents. Recoverable blocked diagnostics exit with status 2. The diagnostic service
and schema are hub-only in Appraise 0.5 and are not copied into scaffold templates.

## Requirements

- Node.js 20.19+
- An existing Appraise project generated from a scaffold that includes `scripts/install-template-step.ts`
- Project dependencies already installed so the local sync scripts can run

## Supported Flags

```bash
npx appraisejs@latest add step <group-slug>/<step-slug> \
  --cwd /path/to/appraise-project \
  --overwrite \
  --dry-run \
  --registry-url https://example.com/registry/template-steps \
  --branch main
```

- `--cwd <path>`: target Appraise project directory
- `--overwrite`: replace an existing step with the same signature
- `--dry-run`: print planned actions without writing files or running sync
- `--registry-url <url>`: override the default registry manifest URL or registry base URL
- `--branch <ref>`: choose a different GitHub branch when using the default public registry

## What It Does

1. Validates the target directory is an Appraise project with the local installer script available.
2. Downloads the public registry manifest and the requested step fragment.
3. Invokes the project-local `appraisejs:install-step` script.
4. Merges the step into `automation/steps`, then runs:
   `sync-template-step-groups`
   `sync-template-steps`

## Registry Overrides

The default registry is served from this repository on GitHub. Use `--registry-url` and `--branch` for development or QA against non-default registry content.
