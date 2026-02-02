# UI Walkthrough

This document gives a guided tour of the web UI and key workflows.

## Navigation Overview

The main navigation groups pages into three areas:

- Dashboard: high-level metrics and quick actions
- Automate: Test Suites, Test Cases, Test Runs, Reports
- Template: Template Steps, Template Step Groups, Template Test Cases
- Configuration: Locators, Locator Groups, Modules, Environments, Tags

## Creating Test Assets

Typical workflow:

1. Create or sync Modules (derived from feature and locator folder structure).
2. Define Template Step Groups and Template Steps (or sync from step files).
3. Create Test Suites and Test Cases in the UI.
4. Assign steps, parameters, tags, and environments.

When you create or update test suites or test cases, the UI regenerates the corresponding feature file under `src/tests/features/`.

## Running Tests

1. Open Test Runs and click Create.
2. Select environment, tags, browser engine, and parallel workers.
3. Start the run. The UI spawns Cucumber and streams status updates.

## Viewing Results

- Reports list runs and their outcomes.
- Drill into a report to see features, scenarios, and step results.
- Logs and traces are stored under `src/tests/reports/` for local inspection.
