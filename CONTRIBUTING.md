# Contributing to AppraiseJS Core

Thank you for your interest in contributing to AppraiseJS Core! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Database Migrations](#database-migrations)
- [Canonical Readiness and Projections](#canonical-readiness-and-projections)
- [Pull Request Process](#pull-request-process)
- [Common Tasks](#common-tasks)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.
Please review `CODE_OF_CONDUCT.md` before contributing.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 22** (the release-CI runtime; package minimum is Node.js 20.19+) - [Download Node.js](https://nodejs.org/)
- **Git** - [Download Git](https://git-scm.com/)
- **npm** (comes with Node.js)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/appraisejs-core.git
   cd appraise
   ```
3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/appraisejs-core.git
   ```

## Development Setup

### Initial Setup

1. **Run the setup script:**

   ```bash
   npm run setup
   ```

   This will:
   - Install dependencies
   - Install Graphify agent tooling when `uv` is available, or print the manual install command
   - Create `.env` file with SQLite configuration
   - Build the local production app

2. **Start the local production server:**

   ```bash
   npm run start
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Optional: install Playwright browsers when you need test execution:**
   ```bash
   npm run install-playwright -- chromium
   ```

### Environment Variables

The setup script creates a `.env` file automatically. If you need to manually configure it, the file should contain SQLite database configuration. See `scripts/setup-env.ts` for details.

### Database

This project uses **SQLite** with **Prisma ORM**. The database file (`prisma/dev.db`) is created automatically during setup. No additional database server is required.

- Database schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/`
- To view/edit data: Use Prisma Studio:
  ```bash
   npx prisma studio
  ```

## Project Structure

```
appraise/
├── prisma/              # Database schema and migrations
│   ├── schema.prisma    # Prisma schema definition
│   └── migrations/      # Database migration files
├── scripts/             # Setup, validation, readiness, and projection utilities
│   ├── sync-step-definitions.ts # Seeds the canonical built-in registry
│   ├── setup-env.ts    # Environment setup
├── src/
│   ├── app/            # Next.js app directory (pages and routes)
│   ├── actions/        # Server actions
│   ├── components/     # React components
│   ├── lib/            # Utility functions and libraries
│   └── tests/          # Runtime support and sealed capsule execution assets
│       ├── config/     # Configuration files (environment, executor scripts)
│       ├── features/   # Runtime-owned feature materialization
│       ├── hooks/      # Cucumber hooks
│       ├── locators/   # Test locators (generated)
│       ├── mapping/    # Locator group to route maps (generated)
│       ├── reports/    # Test reports (generated)
│       ├── steps/      # Step definitions (generated)
│       └── utils/      # Utility scripts
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

## Coding Standards

### TypeScript

- Use **TypeScript** for all new code
- Enable strict mode (already configured in `tsconfig.json`)
- Use type annotations for function parameters and return types
- Avoid `any` type - use `unknown` or proper types instead

### Code Formatting

This project uses **Prettier** for code formatting. The configuration is in `.prettierrc`:

- Single quotes
- No semicolons
- 120 character line width
- 2 space indentation
- Trailing commas

**Format your code before committing:**

```bash
npx prettier --write .
```

### Linting

This project uses **ESLint** with Next.js and TypeScript configurations:

```bash
npm run lint
```

**Fix linting issues automatically:**

```bash
npm run lint -- --fix
```

### File Naming

- React components: `kebab-case.tsx` (e.g., `data-card.tsx`)
- Utility files: `kebab-case.ts` (e.g., `date-utils.ts`)

### Import Organization

- Group imports: external packages first, then internal modules
- Use absolute imports with `@/` prefix for `src/` directory:
  ```typescript
  import { Button } from '@/components/ui/button'
  ```

## Development Workflow

### Branch Strategy

1. **Create a feature branch** from `main`:

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Test your changes**:

   ```bash
   npm run lint
   npm run build
   npm test  # If applicable
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example:

```
feat: add user authentication
fix: resolve database connection issue
docs: update README with setup instructions
```

## Testing

### Running Tests

This project uses **Cucumber** for BDD testing:

```bash
npm test
```

### Writing Tests

- Feature files: `automation/features/*.feature` (Gherkin format)
- Step definitions: `automation/steps/` (Note: some step files are generated)
- Test configuration: `cucumber.mjs`

### Playwright

Playwright is used for browser automation. Browsers are installed during setup:

```bash
npm run install-playwright
```

## Database Migrations

### Creating Migrations

When modifying the Prisma schema (`prisma/schema.prisma`):

1. **Edit the schema file**

2. **Create a migration:**

   ```bash
   npm run migrate-db
   ```

   This will:
   - Generate migration SQL files
   - Apply the migration to your database
   - Regenerate Prisma Client

3. **Review the migration** in `prisma/migrations/`

### Migration Best Practices

- Always review generated migration SQL files
- Test migrations on a copy of production data if possible
- Keep migrations focused and atomic
- Never edit existing migration files (create new ones instead)

## Canonical Readiness and Projections

The database is the sole authoring authority for test structure and configuration; AppraiseJS does not synchronize
those domains with `automation/`. Run `npm run sync-step-definitions` to seed or repair canonical built-in Step
Definitions. Generate human-readable Step projections with `npm run operation:projections`; those projections and
explicit repository exports are derived outputs, never managed inputs or execution authority.

## Pull Request Process

### Before Submitting

1. **Update your branch:**

   ```bash
   git checkout main
   git pull upstream main
   git checkout your-branch
   git rebase upstream/main
   ```

2. **Ensure all checks pass:**
   - Code lints without errors
   - Build succeeds
   - No TypeScript errors

3. **Update documentation** if your changes affect:
   - Setup instructions
   - API usage
   - Configuration options

### Submitting a Pull Request

1. **Push your branch:**

   ```bash
   git push origin your-branch
   ```

2. **Create a Pull Request** on GitHub:
   - Use a clear, descriptive title
   - Fill out the PR template (if available)
   - Reference any related issues
   - Describe what changes you made and why

3. **Respond to feedback:**
   - Address review comments
   - Make requested changes
   - Keep discussions constructive

### PR Checklist

- [ ] Code follows project coding standards
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventional commits
- [ ] No console.log statements left in code
- [ ] No commented-out code
- [ ] Database migrations are included (if schema changed)

## Common Tasks

### Adding a New Component

1. Create component file in `src/components/`
2. Follow naming conventions (kebab-case.tsx)
3. Add TypeScript types
4. Export from appropriate index file if needed

### Modifying Database Schema

1. Edit `prisma/schema.prisma`
2. Run `npm run migrate-db`
3. Review generated migration
4. Update any affected code
5. Test thoroughly

### Adding a New Sync Script

1. Create script in `scripts/` directory
2. Follow existing script patterns
3. Add npm script to `package.json`
4. Document in this file
5. Test with dry-run mode if applicable

### Debugging

- Use `console.log` for debugging (remove before committing)
- Use browser DevTools for frontend debugging
- Use Prisma Studio for database inspection:
  ```bash
  npx prisma studio
  ```

## Getting Help

- Check existing issues and PRs
- Review the README.md
- Ask questions in discussions (if available)
- Create an issue for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0, the same license that governs this project.

---

Thank you for contributing to AppraiseJS Core! 🎉
