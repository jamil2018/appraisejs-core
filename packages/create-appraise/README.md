# create-appraise

Scaffold a new [Appraise](https://github.com/your-org/appraise) app in your directory.

## Usage

```bash
npx create-appraise@latest
```

The CLI will prompt you for:

1. **Project directory** – Where to create the app (default: `./my-appraise-app`). The directory must be empty or not exist.
2. **Package manager** – `npm`, `pnpm`, `yarn`, or `bun`.
3. **Run install** – Whether to run the package manager install step after copying the template.

Progress is shown while copying the template. When finished, you'll see the project path and next steps (e.g. `cd <dir>`, `npm run setup`, `npm run dev`).

By default, the template is **downloaded from the official Appraise GitHub repository** (tarball first, then git clone if the tarball fails). You can override this with environment variables or use the bundled template for offline use.

### Template source and environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CREATE_APPRAISE_REPO_URL` | Git repository base URL (e.g. `https://github.com/owner/appraise`). Used for both tarball and clone. | `https://github.com/jamil2018/appraise` |
| `CREATE_APPRAISE_BRANCH` | Branch or ref to use. | `main` |
| `CREATE_APPRAISE_TEMPLATE_SUBPATH` | Path inside the repo to the template directory (relative to repo root). | `templates/default` |
| `CREATE_APPRAISE_USE_BUNDLED` | Set to `1`, `true`, or `yes` to skip download and use the template bundled in the package. Use for offline or when both download methods fail. | not set (download from repo) |

Download order: the CLI tries the GitHub tarball URL first (no git required); if that fails, it falls back to `git clone`. If both fail, set `CREATE_APPRAISE_USE_BUNDLED=1` to use the bundled template instead.

## After scaffolding

From the new project directory:

1. **If you skipped install:** run your package manager's install (e.g. `npm install --legacy-peer-deps`).
2. Run setup: `npm run setup` (creates `.env`, runs migrations, installs Playwright).
3. Sync entities: `npm run sync-all`.
4. Start the dev server: `npm run dev`.

See the project's `README.md` for full details.

## Publishing to npm

From the repo root or this package directory:

1. Ensure the package builds: `npm run build` (syncs templates and compiles TypeScript).
2. Bump version in `package.json` if needed.
3. Log in to npm: `npm login`.
4. Publish: `npm publish` (from `packages/create-appraise`).

The `files` field in `package.json` includes only `dist` and `templates`, so source and dev dependencies are not published.
