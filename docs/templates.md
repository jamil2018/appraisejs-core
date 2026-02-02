# Templates

This document explains template test cases and template steps.

## Template Test Cases

Template test cases are reusable blueprints for creating new test cases. They are created and managed in the UI and stored in the database (`TemplateTestCase`, `TemplateTestCaseStep`).

Typical use:

- Define a reusable flow once (for example, "login and verify dashboard")
- Instantiate it into a new test case with pre-filled steps

Template test cases are not stored in the filesystem. They are a DB-only convenience for faster authoring.

## Template Steps

Template steps are the building blocks for steps in test cases. They are defined in step definition files under:

- `src/tests/steps/actions/**/*.step.ts`
- `src/tests/steps/validations/**/*.step.ts`

Each step file includes:

1. A group-level JSDoc at the top:

```ts
/**
 * @name click
 * @description Template step for handling element click
 * @type ACTION
 */
```

2. Step-level JSDoc above each step definition:

```ts
/**
 * @name click
 * @description Template step for clicking on an element
 * @icon MOUSE
 */
```

Sync scripts read this metadata and keep template steps in the database aligned with the step files.

Supported parameter placeholders in step signatures:

- `{string}`
- `{int}`
- `{number}`
- `{boolean}`

## Editing Generated Steps

Template steps can be created or modified in the UI. When that happens, the system updates the underlying step file to keep source files and metadata aligned.

Safe patterns:

- Keep group JSDoc at the top of the file.
- Keep step JSDoc immediately above the step definition.
- Avoid manually removing the auto-generated group header or step signatures.

If you edit step files manually, re-run:

```bash
npm run sync-template-step-groups
npm run sync-template-steps
```
