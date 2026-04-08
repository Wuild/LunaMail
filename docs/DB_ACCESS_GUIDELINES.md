# LunaMail DB Access Guidelines

This document defines repository-level DB access rules for LunaMail.

## Primary Rule

- Use Drizzle ORM by default for all new repository code.
- Prefer typed Drizzle builders for `select/insert/update/delete` paths.

## When Raw SQL Is Acceptable

Raw SQL (`db.prepare(...)`) is allowed only when one of the following is true:

- A measured hot path shows meaningful performance gain vs Drizzle.
- Query shape is currently not ergonomic in Drizzle without reducing clarity.
- Migration/compatibility helpers need direct SQLite pragmas or metadata queries.

## Raw SQL Requirements

When keeping or adding raw SQL:

- Add a short comment above the query explaining why Drizzle is not used.
- Keep SQL scoped to repository layer only.
- Keep bind parameters (no string interpolation).
- Keep response shape typed in TypeScript.

## Priority Migration Targets

Migrate these first to Drizzle (unless benchmarked exceptions are documented):

- Folder/message list reads
- Read/unread mutation flows
- Move/archive/delete message flows

## Review Checklist for DB PRs

- New code is Drizzle-first unless exception documented.
- Raw SQL exceptions include rationale comments.
- Behavior and returned types remain backward-compatible.
- `npm run build` passes.
