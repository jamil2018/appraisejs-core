# create-appraisejs

Scaffold a new [Appraise](https://github.com/jamil2018/appraisejs-core) app in your directory.

## Usage

```bash
npx create-appraisejs@latest
```

The CLI will prompt you for:

1. **Project directory** - Where to create the app (default: `./my-appraisejs-app`). The directory must be empty or not exist.
2. **Package manager** - `npm`, `pnpm`, `yarn`, or `bun`.
3. **Run production setup now** - Whether to install dependencies, create `.env`, and build the production app immediately.
4. **Playwright browsers** - Optional multi-select for `chromium`, `firefox`, and `webkit`.

## Default workflow

1. Uses the **bundled template** shipped with `create-appraisejs`.
2. Copies the template into the target directory.
3. Patches `package.json` scripts to use your selected package manager.
4. If you choose setup now, runs the project's `setup` script and then installs any selected Playwright browsers.
5. Prints the project path and production-first next steps (`setup`, optional `install-playwright`, then `start`).

By default, the CLI does **not** download the repo again. Remote download is only used when you explicitly override the template source via environment variables.

## Template source and environment variables

| Variable                           | Description                                                                                                                                    | Default                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `CREATE_APPRAISE_REPO_URL`         | Git repository base URL (e.g. `https://github.com/jamil2018/appraisejs-core`). Used for both tarball and clone.                                | `https://github.com/jamil2018/appraisejs-core` |
| `CREATE_APPRAISE_BRANCH`           | Branch or ref to use.                                                                                                                          | `main`                                         |
| `CREATE_APPRAISE_TEMPLATE_SUBPATH` | Path inside the repo to the template directory (relative to repo root).                                                                        | `templates/default`                            |
| `CREATE_APPRAISE_USE_BUNDLED`      | Set to `1`, `true`, or `yes` to force the bundled template even when remote overrides are present.                                             | bundled template                               |

When any remote override is provided, the CLI tries the GitHub tarball URL first (no git required); if that fails, it falls back to `git clone`.

## After scaffolding

From the new project directory:

- Run `npm run setup` (or your package manager's equivalent) to install dependencies, create `.env`, and build the local production app.
- Optionally install Playwright browsers: `npm run install-playwright -- chromium firefox webkit`.
- Start the production app: `npm run start`.
- Use `npm run dev` only when you specifically want the development server.

## Recovery scripts

- `npm run setup:db` recreates the local SQLite database from migrations and reruns `sync-all`.
- `npm run setup:full` reruns dependency install, DB recovery, and the local production build.
- `npm run appraisejs:sync` reruns the sync pipeline when you edit automation assets manually.
