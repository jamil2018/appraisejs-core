# AppraiseJS Core

AppraiseJS Core is a local-first, single-tenant test automation and management platform built with Next.js. It provides comprehensive test management, execution, and reporting capabilities for modern web applications.

## Project Overview

AppraiseJS Core is designed to help teams manage, organize, and execute automated tests efficiently. It combines a user-friendly web interface with powerful test execution capabilities, supporting Behavior-Driven Development (BDD) workflows through Cucumber and browser automation via Playwright.

### Key Features

#### Test Management
- **Test Suites**: Organize test cases into logical collections for specific features or functionality
- **Test Cases**: Create and manage individual test scenarios with step-by-step definitions
- **Template Test Cases**: Build reusable test templates that can be instantiated into concrete test cases
- **Modules**: Hierarchical organization structure for grouping related test suites
- **Tags**: Flexible categorization and filtering of tests
- **Reviews**: Test case review workflow with reviewer assignments and status tracking
- **Linked Jira Tickets**: Integration with Jira for tracking test cases against tickets

#### Test Execution
- **Test Runs**: Execute test suites or individual test cases with configurable options
- **BDD Support**: Full Cucumber/BDD workflow with Gherkin feature file generation
- **Browser Automation**: Playwright integration for cross-browser testing
- **Test Reports**: Comprehensive execution reports with metrics, charts, and detailed logs
- **Metrics**: Track test execution duration, pass/fail rates, and historical trends

#### Locator Management
- **Locator Groups**: Organize element locators by page or component
- **Locators**: Manage element selectors (CSS, XPath, etc.) for test automation
- **Locator Inspector**: Visual tool for inspecting and generating locators from web pages

#### Template Steps
- **Template Step Groups**: Organize reusable step definitions by category (Actions, Validations, etc.)
- **Template Steps**: Create reusable step definitions with parameters
- **Step Parameters**: Define typed parameters for flexible step reuse

#### Environment Management
- **Environments**: Configure and manage multiple testing environments (dev, staging, production)
- **Environment-specific Configuration**: Store URLs, API keys, and other environment-specific settings

#### File Synchronization
- **Bidirectional Sync**: Automatic synchronization between database and filesystem
- **Feature File Generation**: Automatic generation of Gherkin feature files from test cases
- **Sync Scripts**: Comprehensive sync utilities for all entities (test cases, locators, modules, etc.)

#### Reporting & Analytics
- **Execution Reports**: Detailed reports for each test run with pass/fail status
- **Metrics Dashboard**: Visual charts and metrics for test execution trends
- **Test Suite Metrics**: Aggregate metrics for test suites
- **Test Case Metrics**: Individual test case performance tracking

### Technology Stack

- **Framework**: Next.js 16+ (App Router)
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Testing**: Cucumber (BDD), Playwright (Browser Automation)
- **UI**: React 19, Tailwind CSS, Radix UI components
- **State Management**: TanStack Form, TanStack Table
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ installed
- No additional database setup required (uses SQLite)

### Installation

1. **Clone and install dependencies:**

```bash
git clone <your-repo>
cd appraise
npm install
```

2. **Setup environment and database (automatic):**

```bash
npm run setup
```

This will:

- Install dependencies
- Create `.env` file with SQLite configuration
- Set up the database schema

3. **Start the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Database

This application uses SQLite with Prisma ORM. The database file (`prisma/dev.db`) will be created automatically on first run. No additional database server or configuration is required.

To view and edit database records, use Prisma Studio:
```bash
npx prisma studio
```

## Project Architecture

### Core Concepts

1. **Modules**: Top-level organizational units that contain test suites
2. **Test Suites**: Collections of related test cases grouped by feature or functionality
3. **Test Cases**: Individual test scenarios composed of steps
4. **Template Test Cases**: Reusable test templates that define common test patterns
5. **Template Steps**: Reusable step definitions that can be parameterized
6. **Locator Groups**: Collections of element locators organized by page or component
7. **Locators**: Element selectors used in test automation
8. **Test Runs**: Executions of test suites or test cases with results and reports
9. **Environments**: Configuration for different testing environments

### File Structure

The project follows a structured approach with generated test files:

- `src/tests/features/` - Generated Gherkin feature files
- `src/tests/steps/` - Step definitions (some generated, some custom)
- `src/tests/locators/` - Generated locator files
- `src/tests/mapping/` - Locator group to route mappings
- `src/tests/reports/` - Test execution reports
- `src/tests/config/` - Environment and executor configurations

### Synchronization

AppraiseJS Core maintains bidirectional synchronization between:
- **Database** (SQLite via Prisma) - Primary source of truth for test definitions
- **Filesystem** - Generated test files (Gherkin features, step definitions, locators)

Sync scripts ensure consistency between database and filesystem:
- `npm run sync-all` - Sync all entities
- `npm run sync-features` - Regenerate feature files from database
- Individual sync scripts for each entity type

## Usage

### Creating Test Cases

1. Navigate to **Test Cases** in the web interface
2. Create a new test case with a title and description
3. Add steps using template steps or custom step definitions
4. Assign tags and link to test suites
5. Optionally create from template test cases for faster setup

### Executing Tests

1. Navigate to **Test Runs**
2. Create a new test run
3. Select test suites or specific test cases
4. Choose an environment
5. Execute and view results in real-time
6. Review detailed reports with metrics and logs

### Managing Locators

1. Create **Locator Groups** for organizing locators by page/component
2. Add **Locators** with selectors (CSS, XPath, etc.)
3. Use the **Locator Inspector** to visually inspect and generate locators
4. Sync locators to filesystem for use in test execution

### Working with Templates

1. Create **Template Step Groups** to organize reusable steps
2. Define **Template Steps** with parameters
3. Create **Template Test Cases** for common test patterns
4. Generate concrete test cases from templates

## Scripts

### Setup & Development
- `npm run setup` - Complete initial setup (dependencies, database, Playwright)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Database
- `npm run migrate-db` - Create and apply database migrations
- `npx prisma studio` - Open Prisma Studio for database management

### Synchronization
- `npm run sync-all` - Sync all entities (use after file changes)
- `npm run sync-features` - Regenerate Gherkin feature files
- `npm run sync-locator-groups` - Sync locator groups
- `npm run sync-environments` - Sync environments
- `npm run sync-locators` - Sync locators
- `npm run sync-modules` - Sync modules
- `npm run sync-tags` - Sync tags
- `npm run sync-test-suites` - Sync test suites
- `npm run sync-test-cases` - Sync test cases
- `npm run sync-template-step-groups` - Sync template step groups
- `npm run sync-template-steps` - Sync template steps

### Testing
- `npm test` - Run Cucumber tests
- `npm run install-playwright` - Install Playwright browsers

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on contributing to AppraiseJS Core.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - Learn about Next.js features and API
- [Cucumber Documentation](https://cucumber.io/docs) - BDD testing with Cucumber
- [Playwright Documentation](https://playwright.dev) - Browser automation
- [Prisma Documentation](https://www.prisma.io/docs) - Database ORM

## License

The code in this repository (AppraiseJS Core) is licensed under the
Apache License 2.0.

This repository contains the local-first, single-tenant core of AppraiseJS,
including test management, execution, file synchronization, and UI
components.

Other components of the AppraiseJS platform—such as hosted cloud services
and AI-powered features—are separate products and are not included in
this repository.

For the terms governing use of the code in this repository, see the
LICENSE file.
