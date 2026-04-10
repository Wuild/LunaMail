# App Route/Layout Migration Plan (Next.js-Style `app/`)

## Goal

Adopt a filesystem-driven route + layout model inspired by Next.js:

```txt
app/
  layout.tsx
  blog/
    layout.tsx
    page.tsx
    [slug]/
      page.tsx
```

and migrate all renderer pages, layouts, and tab UIs to this model.

Canonical source of truth for route/page/layout modules:

- `src/renderer/app`

Legacy locations to phase out for migrated areas:

- `src/renderer/pages`
- `src/renderer/routes`

## Why

- Reduce monolithic page files and route switch files.
- Make route ownership obvious from filesystem structure.
- Co-locate route-level layout, page UI, route-specific hooks/components, and route helpers.
- Enable safer incremental refactors and easier onboarding.

## Scope

- Main window routes (`/email`, `/contacts`, `/calendar`, `/settings/*`, `/debug`, `/help`, `/onboarding`,
  `/add-account`)
- Settings tabs and account sub-sections
- Shared route layouts (top-level + section-level)
- Route object generation and validation

Out of scope:

- Electron main/preload IPC contract changes
- Visual redesign unrelated to route/layout structure

## Target Structure

```txt
src/renderer/app/
  layout.tsx                        # global renderer app shell rules
  route.config.ts                   # route metadata helpers (if needed)

  (main)/
    layout.tsx                      # main-window shell (title/nav/status patterns)

    email/
      layout.tsx
      page.tsx
      [accountId]/
        layout.tsx
        page.tsx
        [folderId]/
          page.tsx
          [emailId]/
            page.tsx

    contacts/
      layout.tsx
      page.tsx

    calendar/
      layout.tsx
      page.tsx

    settings/
      layout.tsx
      page.tsx                      # redirects to /settings/application
      application/
        page.tsx
      layout/
        page.tsx
      whitelist/
        page.tsx
      developer/
        page.tsx
      account/
        [accountId]/
          layout.tsx
          page.tsx
          identity/
            page.tsx
          server/
            page.tsx
          filters/
            page.tsx

    debug/
      page.tsx
    help/
      page.tsx

  onboarding/
    layout.tsx
    page.tsx

  add-account/
    layout.tsx
    page.tsx
```

Notes:

- `layout.tsx` wraps all child routes within that folder subtree.
- `page.tsx` is the route endpoint at that folder level.
- `[param]` folders map to dynamic path segments.
- Keep dedicated window entrypoints (compose/message) but migrate their internal route/page structure to this model as
  applicable.

## Routing Contract

- Keep existing public URLs stable unless explicitly approved.
- `/settings` must continue redirecting to `/settings/application`.
- Invalid settings tabs must continue redirecting to `/settings/application`.
- Account settings routes use path params only: `/settings/account/:accountId`.

## Non-Regression Requirements (Mandatory)

- Keep existing design and visual layout parity during migration (no redesign side effects).
- Keep existing functionality and user flows unchanged while moving files/routes.
- Preserve existing keyboard shortcuts, optimistic behaviors, and route-driven state sync.
- Treat this as an architectural migration only; any visual/functionality change must be explicitly requested.

## Full Migration Inventory Checklist

Use this as the complete check-off list for pages, routes, and tabs.

### Main Window Routes

- [x] `/` (root redirect behavior)
- [x] `/email`
- [x] `/email/:accountId`
- [x] `/email/:accountId/:folderId`
- [x] `/email/:accountId/:folderId/:emailId`
- [x] `/mail/*` redirect compatibility
- [x] `/cloud`
- [x] `/contacts`
- [x] `/calendar`
- [x] `/settings` redirect to `/settings/application`
- [x] `/settings/application`
- [x] `/settings/layout`
- [x] `/settings/whitelist`
- [x] `/settings/developer`
- [x] `/settings/account/:accountId`
- [x] `/settings/:tab` invalid-tab fallback redirect
- [x] `/debug` (including feature-flagged visibility behavior)
- [x] `/help`
- [x] `/onboarding` (has-accounts redirect behavior)
- [x] `/add-account`
- [x] `*` wildcard fallback behavior

### First-Launch / No-Account Route Behavior

- [x] No-account root redirect to `/onboarding`
- [x] No-account wildcard redirect to `/onboarding`
- [x] No-account `/add-account` flow behavior

### Settings Tabs and Subsections

- [x] Application tab
- [x] Appearance/Layout tab
- [x] Whitelist tab
- [x] Developer tab
- [x] Account tab route shell
- [x] Account subsection: Identity
- [x] Account subsection: Server
- [x] Account subsection: Filters

### View Modes (Must Be Split Modules)

- [ ] Mail view: `side-list`
- [ ] Mail view: `top-table`
- [ ] Calendar view: `month`
- [ ] Calendar view: `week`

### Window Entry Pages (Non-main Routes)

- [x] Main window bootstrap
- [x] Compose window page
- [x] Message window page
- [x] Splash window page

## Package Requirements

Current packages already available (no install needed):

- `react-router-dom` (routing runtime)
- `vite` + `@vitejs/plugin-react` (build/runtime integration)
- `typescript` (typed route modules)

Packages we do not currently have and should add for this migration:

- `fast-glob`
    - Use for filesystem route discovery (`app/**/page.tsx`, `layout.tsx`).
- `path-to-regexp`
    - Use for robust segment parsing/generation (`[param]` -> `:param`) and matching utilities.

Optional but recommended:

- `zod`
    - Route param validation at route boundaries.

Install commands:

```bash
npm i fast-glob path-to-regexp
npm i zod
```

## Migration Rules

- `src/renderer/app` is the only allowed location for new route/page/layout modules.
- Every route folder must contain:
    - `page.tsx` (required endpoint)
    - optional `layout.tsx` only when the subtree has shared shell/logic
- No monolithic “all tabs in one file” UIs for route tabs/sections.
- Route-specific components/helpers should live under that route folder, not global pages root.
- Shared primitives stay in `components/`, cross-route hooks in `hooks/`, shared route helpers in `app/shared/` or
  `lib/`.
- View modes must be split into explicit route layouts/pages, not large conditional rendering blocks inside a single
  page.
    - Mail: separate `side-list` and `top-table` view modules.
    - Calendar: separate `month` and `week` view modules.

### Self-Contained Page Rule (Mandatory)

- Each `page.tsx` must implement its own route behavior and UI composition.
- Do not create thin wrapper pages that only render one shared mega-component with a different prop/child.
- If logic is shared, extract focused utilities/hooks, but keep route-specific orchestration in that route’s `page.tsx`.
- Target: opening a route folder should be enough to understand that route without tracing through a central monolith.
- Applies equally to view-mode variants (`mail side/top`, `calendar month/week`): each variant must live in its own
  route/view file.

## Mapping (Current -> Target)

- `src/renderer/pages/MailPage.tsx` -> `src/renderer/app/(main)/email/...`
- `src/renderer/routes/ContactsRoute.tsx` -> `src/renderer/app/(main)/contacts/page.tsx`
- `src/renderer/routes/CalendarRoute.tsx` -> `src/renderer/app/(main)/calendar/page.tsx`
- `src/renderer/pages/AppSettingsPage.tsx` + `src/renderer/pages/settings/*` -> `src/renderer/app/(main)/settings/**`
- `src/renderer/routes/OnboardingRoute.tsx` -> `src/renderer/app/onboarding/page.tsx`
- `src/renderer/routes/AddAccountRoute.tsx` -> `src/renderer/app/add-account/page.tsx`
- `src/renderer/routes/*RouteObjects.tsx` -> `src/renderer/app/**/route objects built from folder modules`

## Phased Plan

### Phase 1: App Router Foundation

- [x] Create `src/renderer/app/` root with top-level `layout.tsx`.
- [x] Add folder conventions (`layout.tsx`, `page.tsx`, `[param]/page.tsx`) and shared typing utilities.
- [x] Introduce route module loader/builders for folder-based route registration.
- [x] Add guardrail checks preventing new route modules under `src/renderer/pages` and `src/renderer/routes`.

Exit criteria:

- [x] App can render from new app-route entry without behavior regressions.

### Phase 2: Settings Migration First

- [x] Move `/settings/*` to `app/(main)/settings/**`.
- [x] Move account subsections (`identity/server/filters`) to nested routes.
- [x] Keep redirects compatibility for legacy settings tabs (not query account routes).
- [x] Replace thin tab wrapper files with self-contained page modules per route/tab.

Exit criteria:

- [ ] No settings tab/subsection rendered from monolithic switch file.
- [x] Each settings route page owns its own orchestration (not just prop-forwarding into one central page).

### Phase 3: Core Main Routes

- [x] Migrate `/email` subtree to `app/(main)/email/**`.
- [x] Migrate `/contacts` and `/calendar`.
- [x] Add local route layouts where shared shell logic exists.
- [ ] Split mail view modes into separate modules/layouts (`side-list` vs `top-table`) and load by selected setting.
- [ ] Split calendar view modes into separate modules/layouts (`month` vs `week`) and load by selected setting.

Exit criteria:

- [ ] Main routes are folder-driven with co-located layout/page modules.
- [ ] No in-file monolithic conditional blocks for mail/calendar view modes.

### Phase 4: Utility Routes

- [x] Migrate `/debug`, `/help`, `/onboarding`, `/add-account`.
- [x] Align entrypoints and fallback redirects.

Exit criteria:

- [x] Legacy `routes/*Route.tsx` wrappers are removed or reduced to thin compatibility shims.

### Phase 5: Cleanup and Enforcement

- [ ] Remove deprecated route object indirection that duplicates folder intent.
- [ ] Add architecture check to flag monolithic route/tab files over agreed threshold for route UIs.
- [ ] Document route conventions in `AGENTS.md` renderer rules.

Exit criteria:

- [ ] Route/layout ownership is fully discoverable from filesystem.
- [ ] No route tab systems remain monolithic.

### Phase 6: Legacy Cleanup (Old Files/Code Removal)

- [ ] Delete superseded legacy route/page files once replacement routes are verified.
- [ ] Remove migrated route modules from `src/renderer/pages` and `src/renderer/routes`.
- [ ] Remove dead imports, unused helpers, and compatibility shims no longer needed.
- [ ] Remove duplicate styles/components that only existed for pre-migration route structure.
- [ ] Run dead-code sweep (`rg` + TypeScript + lint) and resolve all orphaned references.
- [ ] Update docs to remove references to deleted route files/old architecture.

Exit criteria:

- [ ] No unreachable legacy route/page modules remain in `src/renderer/routes` or `src/renderer/pages` for migrated
  areas.
- [ ] No unused code paths tied to old routing/layout approach remain.
- [ ] `src/renderer/app` is the single home for active route/page/layout code.

## Validation Checklist (Per Phase)

- [ ] `npm run lint`
- [ ] `npm run check:architecture`
- [ ] `npm run test:unit`
- [x] `npm run build`
- [ ] Manual smoke for navigation, back/forward, deep links, invalid routes

## Risks and Mitigations

- Deep-link regressions:
    - Keep compatibility redirects for legacy tab paths and add explicit route tests.
- Route param drift:
    - Centralize route param typing per folder subtree.
- Over-fragmentation:
    - Use route-local `components/` only when reused within subtree; otherwise keep page files concise.

## Definition of Done

- All main routes, settings tabs, and account subsections are represented as folder-based `layout.tsx` + `page.tsx`
  modules.
- Route files are readable and scoped; no single file owns all tabs/routes for a feature area.
- Existing route behavior and redirects remain intact unless explicitly changed.
