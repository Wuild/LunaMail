# LunaMail Optimization Checklist

Use this as the step-by-step execution checklist for optimization and reuse work across `main` and `renderer`.

## How To Use

- [ ] Work top to bottom; do not start a later phase until the current phase exit criteria are met.
- [ ] Keep each phase in a separate PR (or small PR set) with behavior-preserving changes first.
- [ ] For every PR, attach smoke test results and `npm run build` result.

---

## Phase 0: Baseline and Guardrails

- [ ] Record baseline build status and startup behavior.
- [x] Create or refresh `docs/SMOKE_TEST_CHECKLIST.md`.
- [ ] Run and record baseline smoke checks:
- [ ] Launch app.
- [ ] Load inbox.
- [ ] Open compose window.
- [ ] Open message window.
- [ ] Open settings tabs.
- [ ] Add, update, delete account.
- [x] Agree PR rule: refactor PRs must include `npm run build` + smoke results.

### Exit Criteria

- [ ] Baseline behavior documented.
- [x] Smoke checklist exists and is usable.

---

## Phase 1: Main Window Factory

### Target files

- `src/main/index.ts`
- `src/main/windows/addAccountWindow.ts`
- `src/main/windows/composeWindow.ts`
- `src/main/windows/messageWindow.ts`
- `src/main/windows/splashWindow.ts`

### Checklist

- [x] Add `src/main/windows/windowFactory.ts`.
- [x] Extract shared BrowserWindow defaults (secure `webPreferences`, title bar/menu defaults).
- [x] Extract shared `before-input-event` shortcut handler utility.
- [x] Keep per-window options explicit (`width/height/min/max/modal`).
- [x] Migrate each window module to use shared helpers.
- [ ] Verify no behavior change in all windows.

### Exit Criteria

- [x] Window creation duplication significantly reduced.
- [ ] All windows still open and behave identically.
- [ ] Build and smoke checks pass.

---

## Phase 2: IPC Modularization in Main

### Target files

- `src/main/ipc/accounts.ts`
- `src/main/index.ts`
- new modules under `src/main/ipc/`

### Checklist

- [x] Split account IPC into domain modules:
- [x] `registerAccountCoreIpc.ts`
- [x] `registerMailIpc.ts`
- [x] `registerDavIpc.ts`
- [x] `registerComposeIpc.ts`
- [x] Add shared broadcast helper (`broadcastToAllWindows` + typed wrappers).
- [x] Keep existing channel names unchanged.
- [x] Keep preload contract unchanged.
- [x] Update main bootstrap registration in `src/main/index.ts`.

### Exit Criteria

- [x] Monolithic `accounts.ts` removed or reduced to orchestration.
- [x] No channel naming regressions.
- [ ] Build and smoke checks pass.

---

## Phase 3: Renderer IPC Client + Subscription Hooks

### Target files

- `src/renderer/MainWindowApp.tsx`
- `src/renderer/pages/MailPage.tsx`
- `src/renderer/pages/AppSettingsPage.tsx`
- `src/renderer/pages/MessageWindowPage.tsx`
- new files under `src/renderer/hooks/ipc/` and `src/renderer/lib/`

### Checklist

- [x] Add `src/renderer/lib/ipcClient.ts` with typed wrappers.
- [x] Add `useIpcEvent` hook for safe subscribe/unsubscribe.
- [x] Add shared hooks:
- [x] `useAccounts()`
- [x] `useAppSettings()`
- [x] `useAutoUpdateState()`
- [x] `useWindowControlsState()`
- [x] Replace repeated page-level `window.electronAPI.on...` wiring with hooks.
- [x] Preserve optimistic behavior for user-visible actions.

### Exit Criteria

- [x] Event subscription boilerplate reduced across pages.
- [x] No regressions on unread/account/update indicators.
- [ ] Build and smoke checks pass.

---

## Phase 4: Split Large Renderer Containers

### Target files

- `src/renderer/MainWindowApp.tsx`
- `src/renderer/pages/MailPage.tsx`
- `src/renderer/layouts/MainLayout.tsx`

### Checklist

- [x] Extract route modules:
- [x] `src/renderer/routes/ContactsRoute.tsx`
- [x] `src/renderer/routes/CalendarRoute.tsx`
- [x] Keep `MainWindowApp` as shell/router orchestration.
- [x] Extract Mail hooks:
- [x] `useMailSelection`
- [x] `useMailSyncStatus`
- [x] `useMessageBodyLoader`
- [x] `useOptimisticReadState`
- [x] Split `MainLayout` into reusable subcomponents (folder panel, message list, menus, table config).
- [x] Move date helper functions to `src/renderer/lib/date/`.
- [x] Remove local theme duplication and use `useAppTheme` consistently.

### Exit Criteria

- [ ] Main container files are substantially smaller and easier to reason about.
- [ ] Layout prop surface reduced.
- [ ] Build and smoke checks pass.

---

## Phase 5: Data Layer Cleanup (Drizzle-First)

### Target files

- `src/main/db/repositories/*`
- `src/main/db/schema.ts`
- `src/main/db/drizzle.ts`

### Checklist

- [x] Define rule: Drizzle by default for new repository code.
- [x] Identify hot paths where raw SQL is still justified.
- [x] Migrate high-churn paths first:
- [x] folder/message list reads
- [x] read/unread flows
- [x] move/archive/delete flows
- [x] Add comments for any intentionally retained raw SQL.
- [x] Document DB access conventions in `docs/`.

### Exit Criteria

- [ ] New data access is strongly typed by default.
- [ ] Raw SQL usage is explicit and justified.
- [ ] Build and smoke checks pass.

---

## Phase 6: Async State Standardization (React Query + Optional Zustand)

### Checklist

- [x] Add QueryClient provider in renderer entrypoint.
- [x] Migrate first query set:
- [x] accounts
- [x] folders
- [x] app settings
- [x] Migrate first mutation set with optimistic updates:
- [x] read/unread
- [x] flag/tag
- [x] move/archive/delete
- [x] Use Zustand only for cross-route local UI state that should persist.
- [x] Remove redundant manual loading/error state where Query handles it.

### Exit Criteria

- [ ] Fetching/invalidation behavior is consistent across pages.
- [ ] Optimistic flows remain immediate and resilient.
- [ ] Build and smoke checks pass.

---

## Phase 7: Shared Type Contracts + Preload Hardening

### Checklist

- [x] Move shared IPC payload/result types into a common shared module.
- [x] Centralize shared app settings defaults/options in `src/shared/` and consume from main + renderer.
- [x] Keep `src/preload/index.ts` as single renderer bridge surface.
- [x] Add runtime validation to riskier IPC payload entry points.
- [x] Verify security constraints remain intact:
- [x] `contextIsolation = true`
- [x] `nodeIntegration = false`
- [x] no renderer direct Node/FS/IMAP access

### Exit Criteria

- [x] Type drift between preload/main/renderer is reduced.
- [x] Security contract unchanged or improved.
- [ ] Build and smoke checks pass.

---

## Phase 8: Tests and Tooling Safety Net

### Checklist

- [x] Add unit tests for extracted pure logic first:
- [x] date helpers
- [x] selection logic
- [x] optimistic reducers/state transitions
- [x] Add integration coverage for critical IPC workflows.
- [x] Add lint/check rules for:
- [x] large-file warning thresholds
- [x] discouraged direct event boilerplate patterns
- [x] Keep build and smoke checks required in PR template.

### Exit Criteria

- [x] Refactors are safer due to automated guardrails.
- [x] Regression detection improves before manual QA.

---

## PR Sequence Tracker

- [x] PR-A: Window factory + shared shortcuts.
- [x] PR-B: IPC modular split + broadcast helpers.
- [x] PR-C: Renderer IPC client + shared hooks.
- [x] PR-D: `MainWindowApp` route extraction + date utilities.
- [x] PR-E: `MailPage` hook extraction + `MainLayout` decomposition.
- [x] PR-F: Drizzle-first migration on core mail paths.
- [x] PR-G: React Query rollout + optimistic mutation utilities.
- [x] PR-H: tests and tooling hardening.

---

## Definition of Done

- [ ] Core renderer pages are modular and maintainable.
- [ ] IPC is domain-modular with shared broadcast patterns.
- [ ] Window setup is centralized.
- [ ] Shared hooks cover common fetch/subscription needs.
- [ ] DB access strategy is consistent and documented.
- [ ] Build + smoke tests remain stable through the full sequence.
