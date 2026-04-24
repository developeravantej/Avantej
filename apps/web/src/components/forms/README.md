# apps/web Form Conventions

All dialog forms in this folder use **react-hook-form + zod + shadcn `<Form>` primitives**.

**Canonical reference:** [`brand-form.tsx`](./brand-form.tsx) — the simplest form (1 field), showing the full shape.

**Rules:**
- Zod schema colocated at top of file.
- `organizationId` is a prop, never a form field.
- Prices use `z.number().transform((v) => Math.round(v * 100))`.
- Mutation lives inside the form; parent passes only `isOpen`, `onClose`, `organizationId`, `mode`, `initialData`.
- Field errors: inline `<FormMessage>`. Submit errors: `toast.error(...)` via mutation `onError`.

Plan: `zplan/04-24_14-00_form-standardization/plan/plan.md`.

## Migrated forms

| Form | Phase | Date |
|---|---|---|
| brand-form.tsx | 0 (reference) | 2026-04-24 |
| category-form.tsx | 1 | 2026-04-24 |
| uom-form.tsx | 1 | 2026-04-24 |
| supplier-form.tsx | 1 | 2026-04-24 |
| service-category-form.tsx | 2 | 2026-04-24 |
| role-form.tsx | 2 (rewrite — was dead code) | 2026-04-24 |
| service-form.tsx | 3 | 2026-04-24 |
| product-form.tsx | 3 | 2026-04-24 |
| enhanced-product-form.tsx | 3 (deleted — dead re-export) | 2026-04-24 |

Session: `zplan/04-24_14-00_form-standardization/`.
