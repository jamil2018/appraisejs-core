# Component Organization Rules

These rules are the working baseline for Appraise UI refactors.

## Placement

- Keep route-specific UI in `src/app/(base)/<entity>` by default.
- Move a component into `src/components/<feature>` only when a second route reuses it or when the extraction clearly decouples route code from shared behavior.
- Keep low-level controls and wrappers in `src/components/ui`.
- Do not let shared components import route-local actions, route-local types, or route-specific navigation assumptions.

## File Shape

- Route folders should stay consistent: `page.tsx`, `<entity>-form.tsx`, `<entity>-table.tsx`, `<entity>-table-columns.tsx`, plus narrowly named local helpers such as `helpers.ts`, `types.ts`, or `<entity>-form-helpers.ts`.
- Prefer domain names over abstract names. Use `tag-form-helpers.ts`, not `shared-form-utils.ts`.
- Keep each file focused on one concern: presentation, local interaction state, or async orchestration.

## Extraction Rules

- Extract a child component when the split is mostly visual and prop-driven.
- Extract a hook when the split owns lifecycle, async orchestration, or state transitions.
- Extract helpers for pure mapping, payload shaping, formatting, and validation.
- Do not build generic CRUD abstractions to normalize small forms.

## Testing

- Co-locate tests with the code they protect.
- Shared interactive components need behavior tests for labels, keyboard paths, disabled states, and callback contracts.
- Route-local forms need at least one happy-path submit test and one validation or failure-path test.

## Review Checklist

- Non-trivial components have named `Props` types.
- No new `any`, `React.FC`, or unchecked `as unknown as`.
- Effects have one responsibility and clean up after themselves.
- Derived data stays derived instead of being copied into mirrored state.
- Icon-only actions expose accessible labels.
