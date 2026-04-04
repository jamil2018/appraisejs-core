# create-appraisejs

Scaffold a new [AppraiseJS](https://github.com/jamil2018/appraisejs-core) project.

## Quick Start

```bash
npx create-appraisejs@latest
```

The CLI will ask for:

1. The target directory. It must not exist yet, or it must be empty.
2. The package manager: `npm`, `pnpm`, `yarn`, or `bun`.
3. Whether to run the production setup immediately.
4. Which Playwright browsers you want available: `chromium`, `firefox`, and/or `webkit`.

## What The Scaffolder Does

By default, `create-appraisejs` uses the bundled template shipped inside the package.

During scaffolding it:

1. Copies the packaged AppraiseJS template into your target directory.
2. Renames the packaged `gitignore` file back to `.gitignore`.
3. Rewrites `package.json` scripts so they use your chosen package manager.
4. Preserves the seeded local SQLite database at `prisma/dev.db`.
5. Starts you with a clean automation workspace: `automation/config/environments/environments.json` is reset to `{}`, `automation/mapping/locator-map.json` is reset to `[]`, reusable step definitions are included, and starter features, locators, and reports are not bundled into the generated app.
6. Optionally runs the project's `setup` script and then installs any Playwright browsers you selected.

If you skip setup, the CLI still prints the exact next commands to run.

## Default Local Workflow

From the generated project directory:

```bash
# Install dependencies, create .env, prepare the database, and build the app
npm run setup

# Optional: install only the browsers you need
npm run install-playwright -- chromium

# Start the local production server
npm run start
```

`npm run dev` is still available, but the scaffold is intentionally production-first.

## Generated Project Highlights

The generated project includes:

- a seeded SQLite database at `prisma/dev.db`
- the AppraiseJS dashboard and application code
- automation sync scripts and reusable step definitions
- package-manager-aware scripts such as `setup`, `setup:db`, `setup:full`, `appraisejs:sync`, and `appraisejs:install-step`

The generated project does not include:

- a ready-made `.env` file
- starter feature files under `automation/features`
- starter locator files under `automation/locators`
- automation reports

## Template Source Overrides

The package defaults to the bundled template. Remote fetching is only used when you provide one of the override environment variables below.

| Variable | Description | Default |
| --- | --- | --- |
| `CREATE_APPRAISE_REPO_URL` | Repository URL used for remote template fetching. | `https://github.com/jamil2018/appraisejs-core.git` |
| `CREATE_APPRAISE_BRANCH` | Branch or ref to fetch from the remote repository. | `main` |
| `CREATE_APPRAISE_TEMPLATE_SUBPATH` | Path to the template directory inside that repository. | `templates/default` |
| `CREATE_APPRAISE_USE_BUNDLED` | Set to `1`, `true`, or `yes` to force the bundled template even when remote overrides are present. | bundled template |

When remote mode is active, the CLI tries the repository tarball first and falls back to `git clone` if needed.

Example:

```bash
CREATE_APPRAISE_BRANCH=main CREATE_APPRAISE_TEMPLATE_SUBPATH=templates/default npx create-appraisejs@latest
```

## Common Scripts In The Generated App

| Script | What it does |
| --- | --- |
| `npm run setup` | Install dependencies, create `.env`, rebuild the local DB, build the app, and protect seeded files |
| `npm run setup:db` | Recreate the local SQLite database from migrations and rerun the sync pipeline |
| `npm run setup:full` | Reinstall dependencies, rebuild the DB, rebuild the app, and protect seeded files |
| `npm run install-playwright -- <browser...>` | Install selected Playwright browsers |
| `npm run sync-all` | Run the full sync pipeline |
| `npm run appraisejs:sync` | Alias for `sync-all` |
| `npm run appraisejs:install-step -- --payload-file <path>` | Internal script used by the public `appraisejs add step` CLI |
| `npm run start` | Start the local production server |
| `npm run dev` | Start the Next.js development server |

## Install Additional Template Steps

After dependencies are installed in a generated project, you can pull an individual published template step into `automation/steps` with:

```bash
npx appraisejs@latest add step <group-slug>/<step-slug>
```

The CLI downloads the step fragment, merges it into the correct step group file, and then runs `sync-template-step-groups` followed by `sync-template-steps`.

## Notes

- Node.js `18+` is required.
- The CLI rewrites hardcoded `npm` and `npx` usage inside the generated scripts so `pnpm`, `yarn`, and `bun` work correctly after scaffolding.
- Selecting Playwright browsers in the prompt does not force installation unless you also choose to run setup immediately. If you skip setup, the CLI shows the browser install command in the next steps.
