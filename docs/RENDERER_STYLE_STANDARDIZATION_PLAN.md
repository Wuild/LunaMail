# Renderer Style Standardization Checklist

## Goal

Standardize renderer styling so semantic CSS variables and semantic utility classes control all colors/themes, and Tailwind classes are primarily used for layout/spacing/typography/size.

Theme switching must continue to work by changing only CSS variables, while preserving current light and dark colors.

## Non-Goals

- No visual redesign.
- No color palette changes.
- No route/window behavior changes.

## Target Styling Contract

### 1) CSS variable naming (semantic only)

Use function-based names, not hex/value-based names:

- Surfaces: `--surface-app`, `--surface-titlebar`, `--surface-menubar`, `--surface-sidebar`, `--surface-content`, `--surface-card`, `--surface-overlay`, `--surface-menu`, `--surface-hover`, `--surface-active`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-titlebar`, `--text-inverse`
- Borders: `--border-default`, `--border-strong`, `--border-titlebar`, `--border-accent`
- Brand/feedback: `--color-primary`, `--color-primary-hover`, `--color-accent`, `--color-accent-hover`, `--color-link`

Keep current compatibility aliases during migration, then remove them in final cleanup.

### 2) Semantic class layer (component utilities)

Define reusable classes in `src/renderer/index.css` (or split into `src/renderer/styles/theme.css` later):

- Shell/layout classes:
  - `.lm-shell`, `.lm-titlebar`, `.lm-menubar`, `.lm-sidebar`, `.lm-content`, `.lm-card`, `.lm-overlay`, `.lm-context-menu`, `.lm-statusbar`
- Text classes:
  - `.lm-text-primary`, `.lm-text-secondary`, `.lm-text-muted`, `.lm-text-titlebar`
- Border/background helpers:
  - `.lm-border-default`, `.lm-border-strong`, `.lm-bg-card`, `.lm-bg-sidebar`, `.lm-bg-content`, `.lm-bg-hover`, `.lm-bg-active`
- Control primitives:
  - `.lm-input`, `.lm-select`, `.lm-textarea`
  - `.lm-btn-primary`, `.lm-btn-secondary`, `.lm-btn-ghost`, `.lm-btn-danger`
  - `.lm-menu-item`, `.lm-list-row`

Tailwind in JSX should keep spacing/sizing/layout only (examples: `p-3`, `gap-2`, `flex`, `rounded-md`, `text-sm`, `h-10`).

### 3) Tailwind usage policy

Allowed in JSX:

- Layout: `flex`, `grid`, `items-center`, `justify-between`
- Spacing/sizing: `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, `min-*`, `max-*`
- Typography scale/weight/leading: `text-sm`, `font-medium`, `leading-5`
- Radius/shadow/transition/animation

Disallowed in JSX (except temporary migration areas):

- Theme-specific color classes like `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `stroke-*` when they express semantic UI colors.
- Any `dark:*` color class for standard surfaces/text/borders.

## Implementation Checklist

### Progress Log

- 2026-04-10: Phase 1 semantic class layer added in `src/renderer/index.css` and mapped to existing variables.
- 2026-04-10: Phase 2 shared primitives refactored (`button.tsx`, `FormControls.tsx`, `DynamicSidebar.tsx`,
  `WorkspaceLayout.tsx`, `WindowTitleBar.tsx`).
- 2026-04-10: Initial Phase 3 pass started in `AppSettingsPage.tsx` (shell/menubar/footer/allowlist card patterns).
- 2026-04-10: Phase 3 refactor completed for `MailPage.tsx` and `MessageWindowPage.tsx` (reader/workspace semantic
  surfaces, menus, cards, overlays, and control variants).
- 2026-04-10: Phase 3 refactor completed for `ComposeEmailPage.tsx` (compose shell, footer, cloud picker, recipient
  chips/input, and attachment cards migrated to semantic classes).
- 2026-04-10: Phase 3 refactor completed for `CloudFilesPage.tsx` (sidebar, table, context menus, and account/folder/share modals migrated to semantic classes).
- 2026-04-10: Phase 3 refactor completed for `ContactsRoute.tsx` (accounts sidebar, contacts list, toolbar controls,
  field lists, and modal dialogs migrated to semantic classes).
- 2026-04-10: Phase 3 refactor completed for `CalendarRoute.tsx` (sidebar, calendar shell, toolbar controls, month/day
  panes, and event editor dialogs migrated to semantic classes).
- 2026-04-10: Phase 3 refactor completed for `AppSettingsPage.tsx` (allowlist/layout/developer panels, account
  sections, filter editor/actions, and updater/account modals migrated to semantic classes).
- 2026-04-10: Phase 4 cleanup slice completed for `AppSettingsGeneralPanel.tsx` (general/settings cards, update/default
  app controls, and form select rows migrated to semantic classes).
- 2026-04-10: Phase 4 cleanup slice completed for `SupportPage.tsx` and `SettingsAddAccount.tsx` (page shells, cards,
  controls, banners, and wizard/footer states migrated to semantic classes).
- 2026-04-10: Phase 4 cleanup slice completed for `components/mail/AccountFolderSidebar.tsx` (account rows, folder
  tree shells, drag overlays, and sidebar controls migrated to semantic classes).
- 2026-04-10: Phase 4 cleanup slice completed for `components/mail/MailSearchModal.tsx` (modal surface, advanced
  filters, result rows, and search action controls migrated to semantic classes).
- 2026-04-10: Phase 4 cleanup slice completed for `components/mail/TopTableMailPane.tsx` (table shell, header actions,
  selection toolbar, drag overlays, and resize handles migrated to semantic classes).
- 2026-04-10: Validation for this slice passed:
  - `npm run check:architecture`
  - `npm run test:unit`
  - `npm run build`
- 2026-04-10: `dark:` usage snapshot after `CalendarRoute.tsx` slice:
  - `src/renderer`: 542
  - `src/renderer/pages/AppSettingsPage.tsx`: 124
  - `src/renderer/routes/CalendarRoute.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `AppSettingsPage.tsx` slice:
  - `src/renderer`: 418
  - `src/renderer/pages/AppSettingsPage.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `AppSettingsGeneralPanel.tsx` slice:
  - `src/renderer`: 374
  - `src/renderer/pages/AppSettingsGeneralPanel.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `SupportPage.tsx` + `SettingsAddAccount.tsx` slice:
  - `src/renderer`: 318
  - `src/renderer/pages/SupportPage.tsx`: 0
  - `src/renderer/pages/SettingsAddAccount.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `AccountFolderSidebar.tsx` slice:
  - `src/renderer`: 291
  - `src/renderer/components/mail/AccountFolderSidebar.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `MailSearchModal.tsx` slice:
  - `src/renderer`: 264
  - `src/renderer/components/mail/MailSearchModal.tsx`: 0
- 2026-04-10: `dark:` usage snapshot after `TopTableMailPane.tsx` slice:
  - `src/renderer`: 239
  - `src/renderer/components/mail/TopTableMailPane.tsx`: 0

### Phase 0: Baseline and freeze

- [ ] Capture baseline screenshots in both themes for:
  - [ ] Mail
  - [ ] Contacts
  - [ ] Calendar
  - [ ] Settings
  - [ ] Cloud Files
  - [ ] Compose
  - [ ] Message Window
- [ ] Record current color tokens in `src/renderer/index.css` as source of truth.
- [ ] Confirm no color value changes in this phase.
- [ ] Phase 0 exit criteria met (baseline complete, visuals unchanged).

### Phase 1: Build semantic primitives in CSS

- [x] Add missing semantic classes in CSS:
  - [x] Shell/layout classes (`.lm-shell`, `.lm-titlebar`, `.lm-menubar`, `.lm-sidebar`, `.lm-content`, `.lm-card`, `.lm-overlay`, `.lm-context-menu`, `.lm-statusbar`)
  - [x] Text classes (`.lm-text-primary`, `.lm-text-secondary`, `.lm-text-muted`, `.lm-text-titlebar`)
  - [x] Border/background helpers (`.lm-border-default`, `.lm-border-strong`, `.lm-bg-card`, `.lm-bg-sidebar`, `.lm-bg-content`, `.lm-bg-hover`, `.lm-bg-active`)
  - [x] Control primitives (`.lm-input`, `.lm-select`, `.lm-textarea`, `.lm-btn-primary`, `.lm-btn-secondary`, `.lm-btn-ghost`, `.lm-btn-danger`, `.lm-menu-item`, `.lm-list-row`)
- [x] Map each semantic class to existing variables (no new visual values).
- [x] Add short comments in CSS for class purpose (surface/text/control).
- [ ] Confirm no JSX changes in this phase.
- [ ] Phase 1 exit criteria met (app renders identically).

### Phase 2: Shared primitives first

- [x] Refactor `src/renderer/components/ui/button.tsx`
- [x] Refactor `src/renderer/components/ui/FormControls.tsx`
- [x] Refactor `src/renderer/components/navigation/DynamicSidebar.tsx`
- [x] Refactor `src/renderer/layouts/WorkspaceLayout.tsx`
- [x] Refactor `src/renderer/components/WindowTitleBar.tsx`
- [x] Replace inline color classes + `dark:*` with semantic classes in all files above.
- [x] Keep Tailwind classes structural only (layout/spacing/typography/sizing).
- [x] Phase 2 exit criteria met:
  - [x] Shared primitives expose semantic variants only.
  - [x] No direct color `dark:*` classes remain in these files.

### Phase 3: High-impact pages/routes

- [x] Refactor `src/renderer/pages/AppSettingsPage.tsx`
- [x] Refactor `src/renderer/routes/CalendarRoute.tsx`
- [x] Refactor `src/renderer/pages/CloudFilesPage.tsx`
- [x] Refactor `src/renderer/routes/ContactsRoute.tsx`
- [x] Refactor `src/renderer/pages/MailPage.tsx`
- [x] Refactor `src/renderer/pages/ComposeEmailPage.tsx`
- [x] Refactor `src/renderer/pages/MessageWindowPage.tsx`
- [ ] Convert repeated visual patterns to semantic classes.
- [ ] Extract repeated row/menu/card patterns into local reusable components where needed.
- [ ] Phase 3 exit criteria met:
  - [ ] Theme switching relies on CSS variables + semantic classes.
  - [ ] Page-level hardcoded color literals removed from refactored files.

### Phase 4: Remaining components and cleanup

- [ ] Refactor remaining `src/renderer/components/mail/*`.
- [ ] Refactor remaining editor/theme-sensitive components (Lexical/editor helpers).
- [ ] Refactor remaining renderer utilities/pages with color classes.
- [ ] Remove obsolete compatibility aliases after reference audit.
- [ ] Remove remaining color `dark:*` classes (allow only approved non-color exceptions).
- [ ] Phase 4 exit criteria met:
  - [ ] `rg -n "dark:" src/renderer` shows only approved exceptions.
  - [ ] `rg -n "(bg|text|border|ring|fill|stroke)-.*dark:" src/renderer` is empty.

## Mechanical Refactor Rules Checklist

- [ ] Preserve color values by mapping old class pairs to semantic classes.
- [ ] Replace recurring patterns with semantic equivalents:
  - [ ] `border-slate-200 dark:border-[#3a3d44]` -> `.lm-border-default`
  - [ ] `bg-white dark:bg-[#2b2d31]` -> `.lm-bg-card` or `.lm-sidebar` (by context)
  - [ ] `text-slate-900 dark:text-slate-100` -> `.lm-text-primary`
  - [ ] `text-slate-500 dark:text-slate-400` -> `.lm-text-muted`
- [ ] Avoid one-off page-level custom color classes.
- [ ] For new semantic roles, add token + semantic class first, then consume.

## Validation Checklist (per slice)

- [x] `npm run check:architecture`
- [x] `npm run test:unit`
- [x] `npm run build`
- [ ] Manual smoke in both themes for refactored areas.

- [x] Record results in `docs/SMOKE_TEST_CHECKLIST.md`.
- [x] Update `docs/OPTIMIZATION_ROADMAP.md` when applicable.

## Definition of Done Checklist

- [ ] Theme colors are fully controlled in CSS variable definitions.
- [ ] Renderer JSX uses semantic classes for color/surface/text/border states.
- [ ] Tailwind classes in JSX are mostly structural (layout/spacing/typography/sizing).
- [ ] Current light/dark look is preserved.
