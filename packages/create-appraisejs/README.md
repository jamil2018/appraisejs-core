# create-appraisejs

Scaffold a new [Appraise](https://github.com/jamil2018/appraisejs-core) app in your directory.

## Usage

```bash
npx create-appraisejs@latest
```

The CLI will prompt you for:

1. **Project directory** – Where to create the app (default: `./my-appraisejs-app`). The directory must be empty or not exist.
2. **Package manager** – `npm`, `pnpm`, `yarn`, or `bun`.
3. **Run setup now** – Whether to run the project’s setup script after copying the template (installs dependencies, creates `.env`, runs migrations, installs Playwright). If you skip this, you run setup yourself before starting the app.

**Workflow:**

1. Validates the target directory (must be empty or non-existent).
2. Downloads the template from the repo (tarball first, then git clone if the tarball fails), or uses the bundled template when `CREATE_APPRAISE_USE_BUNDLED` is set.
3. Copies the template into the target directory and patches `package.json` scripts to use your chosen package manager.
4. If you chose to run setup, runs the project’s `setup` script in the new directory.
5. Prints the project path and next steps (`cd <dir>`, then `npm run setup` if you skipped, then `npm run dev`).

By default, the template is **downloaded from the official Appraise GitHub repository**. You can override this with environment variables or use the bundled template for offline use.

### Template source and environment variables

| Variable                           | Description                                                                                                                                    | Default                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `CREATE_APPRAISE_REPO_URL`         | Git repository base URL (e.g. `https://github.com/jamil2018/appraisejs-core`). Used for both tarball and clone.                                | `https://github.com/jamil2018/appraisejs-core` |
| `CREATE_APPRAISE_BRANCH`           | Branch or ref to use.                                                                                                                          | `main`                                         |
| `CREATE_APPRAISE_TEMPLATE_SUBPATH` | Path inside the repo to the template directory (relative to repo root).                                                                        | `templates/default`                            |
| `CREATE_APPRAISE_USE_BUNDLED`      | Set to `1`, `true`, or `yes` to skip download and use the template bundled in the package. Use for offline or when both download methods fail. | not set (download from repo)                   |

Download order: the CLI tries the GitHub tarball URL first (no git required); if that fails, it falls back to `git clone`. If both fail, set `CREATE_APPRAISE_USE_BUNDLED=1` to use the bundled template instead.

## After scaffolding

From the new project directory:

- **If you skipped setup:** run `npm run setup` (or your package manager’s equivalent: `pnpm run setup`, etc.). This installs dependencies, creates `.env`, runs migrations, and installs Playwright.
- **If you ran setup:** you can go straight to the next step.
- Sync entities: `npm run sync-all` (or `pnpm run sync-all`, etc.).
- Start the dev server: `npm run dev` (or your package manager’s equivalent).
