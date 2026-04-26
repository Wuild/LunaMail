# Localization Design (i18n) for LlamaMail

## Status
- Proposed
- Date: 2026-04-26
- Owner: App/Core team

## Problem Statement
The app currently has a `language` setting (`system` / `en-US`) and locale-aware date formatting, but user-facing text is still mostly hardcoded in renderer and main process code. We need a consistent localization system and a migration plan so all user-visible strings use translation helpers (`t()` in renderer, `__()` in backend/main).

## Goals
- Introduce a single i18n architecture used by renderer and main process.
- Migrate all user-visible hardcoded strings to translation keys.
- Keep preload as a pure bridge layer (no translation logic there).
- Keep behavior stable while migrating in small slices.
- Add guardrails so new user-facing strings do not bypass i18n.

## Non-Goals
- Localizing debug/internal logs by default.
- Translating protocol names, route IDs, DB schema names, IPC channel IDs, MIME labels, CSS class names, or other internal identifiers.
- Shipping many languages in phase 1 (English baseline first; additional locales can be added incrementally).

## Current State (Observed)
- Language setting exists in shared types: `AppLanguage = 'system' | 'en-US'`.
- Main process resolves system locale (`get-system-locale` IPC).
- Date/time formatting already uses `Intl`.
- No translation framework or shared message catalog currently exists.
- Broad literal footprint exists across the app.

Approximate hotspots from scan (string-literal matches, includes non-user strings, used for prioritization):

### Renderer/UI hotspots
- `src/renderer/app/main/cloud/[accountId]/page.tsx` (188)
- `src/renderer/app/main/calendar/[accountId]/page.tsx` (171)
- `src/renderer/app/add-account/AddAccountForm.tsx` (171)
- `src/renderer/app/windows/compose/page.tsx` (151)
- `src/renderer/app/main/contacts/[accountId]/page.tsx` (149)
- `src/renderer/MainWindowApp.tsx` (69)

### Main/backend hotspots
- `src/main/dav/davSyncRuntime.ts` (107)
- `src/main/index.ts` (93)
- `src/main/ipc/accounts.ts` (75)
- `src/main/db/repositories/davRepo.ts` (56)
- `src/main/ipc/cloud.ts` (49)
- `src/main/ipc/registerMailIpc.ts` (46)

## Architecture Decisions

## 1) i18n libraries and runtime model
- Use `i18next` as the core translation engine for both renderer and main.
- Use `react-i18next` in renderer for hooks/components (`useTranslation` -> `t()`).
- Put i18n runtime and helper APIs in `@llamamail/app` (single source of truth).
- Expose a backend wrapper function `__(key, options?)` via `@llamamail/app` APIs for main-process use.
- Translation resources are JSON files under `/locales/` so both main and renderer consume the same keys.

Proposed structure:

```text
locales/
  en-US/
    common.json
    email.json
    contacts.json
    calendar.json
    cloud.json
    settings.json
    errors.json

src/packages/app/src/i18n/
  index.ts
  renderer.ts
  main.ts
  localeResolution.ts
```

## 2) Locale resolution
Locale priority:
1. App setting `language` when not `system`
2. System locale from main (`resolveSystemLocale`)
3. Fallback `en-US`

Renderer and main must use the same resolved locale.

## 3) Ownership of translated text
- Renderer (`t()`): labels, buttons, placeholders, headings, page copy, validation copy, toasts shown from renderer state.
- Main (`__()`): native notifications, dialog text, updater status messages, error strings emitted to renderer when still string-based.
- Preferred future IPC contract: main sends structured codes + params; renderer renders final localized text via `t()`. During migration, localized strings from main are allowed to avoid regressions.

## 4) Key conventions
- Use namespaced keys: `calendar.event.delete.confirm_title`.
- Keep keys stable; do not use English sentence as key.
- Interpolation for dynamic content:
  - `t('calendar.event.delete.body', {title})`
  - `__('mail.sync.failed_for_account', {accountName, reason})`
- Plurals use i18next plural rules (`key_one`, `key_other`).

## 5) Fallback and missing keys
- `fallbackLng: 'en-US'`
- In development, log missing keys with file/key context.
- In production, render fallback English and capture telemetry counter (optional phase 2).

## Implementation Plan

## Phase 1: Foundation
- Add deps: `i18next`, `react-i18next` (and optional backend loader helper if needed).
- Add `/locales/` translation resource files with initial `en-US`.
- Add i18n bootstrap/helpers inside `@llamamail/app` (`src/packages/app/src/i18n/*`):
  - initialize i18next
  - expose renderer and main adapters from the package
  - export `setLocale(locale)`, `t(...)`, and `__(...)` wrappers as package-level utilities
- Wire renderer to consume i18n setup from `@llamamail/app` instead of owning separate i18n runtime code.
- Wire main process to consume `__()` and locale updates from `@llamamail/app`.
- Ensure app boot sequence initializes i18n before UI/notification strings are used.

## Phase 2: Renderer migration (high traffic surfaces first)
Priority order:
1. `src/renderer/MainWindowApp.tsx`
2. `src/renderer/app/windows/compose/page.tsx`
3. `src/renderer/app/main/email/page.tsx`
4. `src/renderer/app/main/contacts/[accountId]/page.tsx`
5. `src/renderer/app/main/calendar/[accountId]/page.tsx`
6. `src/renderer/app/main/cloud/[accountId]/page.tsx`
7. Settings + onboarding pages
8. Shared renderer components under `src/renderer/components/**`

Rules:
- Replace hardcoded user copy with `t('...')`.
- Keep non-user literals untouched (route paths, class names, enums).
- For repeated text, centralize key usage in helper functions.

## Phase 3: Main/backend migration
Priority order:
1. `src/main/ipc/settings.ts` (notifications, dev notifications)
2. `src/main/updater/autoUpdate.ts`
3. `src/main/index.ts` (global user-facing error emission)
4. `src/main/ipc/accounts.ts`, `src/main/ipc/registerMailIpc.ts`, `src/main/ipc/cloud.ts`
5. DAV/mail runtime user-visible messages

Rules:
- Wrap user-facing strings with `__()`.
- Keep structured/internal logs in English constants unless explicitly needed for UI.
- For IPC responses currently returning free-form message text, add message keys progressively where practical.

## Phase 4: Guardrails and completion
- Add `scripts/check-i18n.cjs` to detect new hardcoded user-facing strings in:
  - JSX text nodes
  - `title=`, `placeholder=`, `aria-label=`
  - `Notification`, `dialog`, and renderer toast payloads
- Add npm script: `npm run check:i18n`.
- Wire into CI after baseline migration.
- Document contributor rules: all new user-visible text must use `t`/`__`.

## Migration Inventory Process
Use repeatable scans during migration:

```bash
rg -n --glob '*.ts' --glob '*.tsx' "\"[^\"]*[A-Za-z][^\"]* [^\"]*\"|'[^']*[A-Za-z][^']* [^']*'" src/renderer src/main
```

Then triage each hit into:
- user-visible (must migrate)
- internal constant (leave as-is)
- third-party/protocol/schema constant (leave as-is)

Track progress by file checklist in a follow-up roadmap doc (`docs/I18N_MIGRATION_CHECKLIST.md`).

## API/Type Changes Needed
- Expand `AppLanguage` in `src/packages/app/src/ipcTypes.ts` as new locales are added (for example `sv-SE`, `de-DE`).
- Keep `'system'` sentinel.
- Add shared helpers in `src/packages/app/src/i18n` for:
  - locale normalization
  - available locale list
  - fallback policy

## Risks and Mitigations
- Risk: Large PRs with mixed behavior and copy changes.
  - Mitigation: Slice by route/module and keep each PR behavior-preserving.
- Risk: Missing keys at runtime.
  - Mitigation: dev missing-key warnings + CI check script.
- Risk: Divergence between main and renderer locale.
  - Mitigation: single locale-resolution policy and explicit `setMainLocale` on settings change.
- Risk: Translating backend error text too early can block IPC cleanup.
  - Mitigation: allow transitional localized strings, then move to message-code contracts.

## Validation Requirements
For each migration slice:
- `npm run check:architecture`
- `npm run test:unit`
- `npm run build`
- `npm run check:i18n` (after this script is added)

## Definition of Done
- All user-visible strings in renderer and main are sourced via `t()` or `__()`.
- No new user-facing hardcoded strings are allowed by CI.
- Locale switching (`system` and explicit language) updates UI and backend-generated notifications consistently.
- English baseline catalog is complete and stable, with documented key conventions.
