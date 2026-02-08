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
