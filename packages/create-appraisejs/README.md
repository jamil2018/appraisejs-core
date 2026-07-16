# create-appraisejs

Scaffold a new [AppraiseJS](https://github.com/jamil2018/appraisejs-core) project.

## Quick Start

```bash
npx create-appraisejs@latest
```

To scaffold the minimal variant without bundled template steps:

```bash
npx create-appraisejs@latest --template blank
```

The CLI will ask for:

1. The target directory. It must not exist yet, or it must be empty.
2. The template: `starter` or `blank`.
3. The package manager: `npm`, `pnpm`, `yarn`, or `bun`.
4. Whether to run the production setup immediately.
5. Which Playwright browsers you want available: `chromium`, `firefox`, and/or `webkit`.

## What The Scaffolder Does

By default, `create-appraisejs` composes the bundled base template with the `starter` flavor overlay shipped inside the
package.

Available templates:

- `starter`: opinionated scaffold with bundled core template steps included.
- `blank`: the same app scaffold without bundled template steps; add steps later with `appraisejs add step`.

During scaffolding it:

1. Copies the packaged AppraiseJS base template into your target directory, then applies the selected flavor overlay.
2. Renames the packaged `gitignore` file back to `.gitignore`.
3. Rewrites `package.json` scripts so they use your chosen package manager.
4. Preserves the seeded local SQLite database at `prisma/dev.db`.
5. Starts you with a clean automation workspace: `automation/config/environments/environments.json` is reset to `{}`, `automation/mapping/locator-map.json` is reset to `[]`, starter features, locators, and reports are not bundled into the generated app, and reusable step definitions are included only for the `starter` template.
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

## Template Storage

The package is bundled-only: it does not fetch scaffold templates from a remote repository at runtime. Published
contents are stored as one full `templates/base` scaffold plus small `templates/flavors/starter` and
`templates/flavors/blank` overlays.

## Common Scripts In The Generated App

| Script                                                     | What it does                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run setup`                                            | Install dependencies, create `.env`, rebuild the local DB, build the app, and protect seeded files |
| `npm run setup:db`                                         | Recreate the local SQLite database from migrations and rerun the sync pipeline                     |
| `npm run setup:full`                                       | Reinstall dependencies, rebuild the DB, rebuild the app, and protect seeded files                  |
| `npm run install-playwright -- <browser...>`               | Install selected Playwright browsers                                                               |
| `npm run sync-all`                                         | Run the full sync pipeline                                                                         |
| `npm run appraisejs:sync`                                  | Alias for `sync-all`                                                                               |
| `npm run appraisejs:install-step -- --payload-file <path>` | Internal script used by the public `appraisejs add step` CLI                                       |
| `npm run start`                                            | Start the local production server                                                                  |
| `npm run dev`                                              | Start the Next.js development server                                                               |

## Install Additional Template Steps

After dependencies are installed in a generated project, you can pull an individual published template step into `automation/steps` with:

```bash
npx appraisejs@latest add step <group-slug>/<step-slug>
```

The CLI downloads the step fragment, merges it into the correct step group file, and then runs `sync-template-step-groups` followed by `sync-template-steps`.

## Notes

- Node.js `20.19+` is required.
- The CLI rewrites hardcoded `npm` and `npx` usage inside the generated scripts so `pnpm`, `yarn`, and `bun` work correctly after scaffolding.
- Selecting Playwright browsers in the prompt does not force installation unless you also choose to run setup immediately. If you skip setup, the CLI shows the browser install command in the next steps.
