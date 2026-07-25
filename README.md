# AppraiseJS

[![License](https://img.shields.io/badge/License-Apache--2.0-cyan?logo=apache)](./LICENSE)
[![npm](https://img.shields.io/npm/v/create-appraisejs)](https://www.npmjs.com/package/create-appraisejs)
[![Docs](https://img.shields.io/badge/docs-appraisejs.dev-0f766e)](https://appraisejs.dev/)

Visual test management, orchestration, and execution for modern QA teams.

## Content

- [About AppraiseJS](#about-appraisejs)
- [Documentation](#documentation)
- [How to Use AppraiseJS](#how-to-use-appraisejs)
- [How to Contribute](#how-to-contribute)
- [Discussions](#discussions)
- [License](#license)

## About AppraiseJS

AppraiseJS is a local-first platform for creating, managing, and running automated tests with a visual workflow.

AppraiseJS 0.5 is a single-user local tool. Supported development, production, and HTTP MCP processes bind only to
`127.0.0.1`; remote or multi-user exposure is unsupported until a separate authentication and authorization design is
approved. Environment credentials are configured by process-environment variable name and are resolved only inside
the execution process—secret values are never stored by AppraiseJS.

- **Visual-first authoring:** build test scenarios without writing framework glue code.
- **No-code and production-ready:** compose robust test flows through reusable building blocks.
- **Portable artifacts:** generate standards-based assets such as Gherkin and Playwright-friendly outputs.
- **Fast onboarding:** start quickly with sensible defaults and minimal setup overhead.
- **Shared workflow:** QA, manual testers, and developers collaborate in one place.

## Documentation

Project documentation has moved to [appraisejs.dev](https://appraisejs.dev/).

- Start here: [https://appraisejs.dev/](https://appraisejs.dev/)
- All setup, guides, architecture details, and references now live on the docs site.

## How to Use AppraiseJS

### Requirements

- Node.js 20.19+
- npm

### Getting Started

Create a new AppraiseJS project with the official CLI:

```bash
npx create-appraisejs
```

Then follow the setup instructions in the docs:

- [AppraiseJS Documentation](https://appraisejs.dev/)
- [create-appraisejs on npm](https://www.npmjs.com/package/create-appraisejs)

Reusable browser behavior is discovered, drafted, reviewed, and published as versioned Step Definitions in the
Appraise hub. Authored test records store exact Step Invocations; no local legacy-step installer or registry is
supported.

## How to Contribute

- Read the contribution guide: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Follow the code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Review security policy: [SECURITY.md](./SECURITY.md)

## Discussions

- Report bugs and request features in [GitHub Issues](https://github.com/jamil2018/appraise/issues)
- Get support details in [SUPPORT.md](./SUPPORT.md)

## License

AppraiseJS is licensed under Apache-2.0. See [LICENSE](./LICENSE).
