# Locators

This document explains how locators are modeled, stored, and consumed by tests.

## Locator Groups

Locator groups are JSON files under `src/tests/locators/**`. The file name becomes the group name and the folder path becomes the module path.

Examples:

- `src/tests/locators/home/home.json` -> group `home`, module `/home`
- `src/tests/locators/core/text-box.json` -> group `text-box`, module `/core`

Each file contains a map of locator names to selector strings (CSS or XPath):

```json
{
  "header": "header",
  "elements": "//h5[text()='Elements']"
}
```

## Locator Records

A locator is stored as:

- `name`: key in the JSON file
- `value`: selector string (CSS or XPath)
- `locatorGroup`: group inferred from filename

Best practices:

- Use stable, semantic names (for example `submit button`, `login form`).
- Prefer data attributes or stable ids when available.
- Keep selectors short and resilient to layout changes.

## Mapping

The locator map at `src/tests/mapping/locator-map.json` links URL paths to locator group names. Example:

```json
[
  { "name": "home", "path": "/" },
  { "name": "text-box", "path": "/text-box" }
]
```

At runtime, the test harness uses the current URL path to select the locator group, then resolves locator names within that group.

## Usage in Steps

Step definitions call `resolveLocator(page, locatorName)` which:

- Determines the current route
- Looks up the matching group in the locator map
- Loads the locator JSON for that group
- Returns the selector for the given locator name

Example step signature:

```text
When the user clicks on the {string} element
```

The `{string}` argument should match a key in the current locator group.

## Conflicts

When syncing locators from files, the system can detect:

- Duplicate names in the same group
- Duplicate values with different names

Conflicts are stored in `ConflictResolution` and surfaced in the UI for review.
