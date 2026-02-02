# Quick Start

This document provides the shortest path to getting AppraiseJS Core running locally.

## Prerequisites

- Node.js (LTS recommended)
- npm
- Git

## Install

```bash
git clone <your-repo-url>
cd appraise
npm run install-dependencies
```

## Setup

```bash
npm run setup
```

What the setup script does:

- Installs dependencies
- Creates a local `.env` with a SQLite `DATABASE_URL`
- Runs Prisma migrations
- Installs Playwright browsers and OS dependencies

## Run

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Next Steps

- Read the [Overview](overview.md) for concepts and scope
- Review [Architecture](architecture.md) and [Configuration](configuration.md)
- Run tests via [Testing](testing.md)
