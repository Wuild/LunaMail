# LunaMail Optimization Checklist

Use this as the step-by-step execution checklist for optimization and reuse work across `main` and `renderer`.

## How To Use

- [ ] Work top to bottom; do not start a later phase until the current phase exit criteria are met.
- [ ] Keep each phase in a separate PR (or small PR set) with behavior-preserving changes first.
- [ ] For every PR, attach smoke test results and `npm run build` result.

---

## Phase 0: Baseline and Guardrails

- [ ] Record baseline build status and startup behavior.
- [ ] Create or refresh `docs/SMOKE_TEST_CHECKLIST.md`.
- [ ] Run and record baseline smoke checks:
- [ ] Launch app.
- [ ] Load inbox.
- [ ] Open compose window.
- [ ] Open message window.
- [ ] Open settings tabs.
- [ ] Add, update, delete account.
- [ ] Agree PR rule: refactor PRs must include `npm run build` + smoke results.

### Exit Criteria

- [ ] Baseline behavior documented.
- [ ] Smoke checklist exists and is usable.

---

## Phase 1: Main Window Factory

### Target files

- `src/main/index.ts`
- `src/main/windows/addAccountWindow.ts`
- `src/main/windows/composeWindow.ts`
- `src/main/windows/messageWindow.ts`
- `src/main/windows/splashWindow.ts`

### Checklist

- [ ] Add `src/main/windows/windowFactory.ts`.
- [ ] Extract shared BrowserWindow defaults (secure `webPreferences`, title bar/menu defaults).
- [ ] Extract shared `before-input-event` shortcut handler utility.
- [ ] Keep per-window options explicit (`width/height/min/max/modal`).
- [ ] Migrate each window module to use shared helpers.
- [ ] Verify no behavior change in all windows.

### Exit Criteria

- [ ] Window creation duplication significantly reduced.
- [ ] All windows still open and behave identically.
- [ ] Build and smoke checks pass.

---

## Phase 2: IPC Modularization in Main

### Target files

- `src/main/ipc/accounts.ts`
- `src/main/index.ts`
- new modules under `src/main/ipc/`

### Checklist

- [ ] Split account IPC into domain modules:
- [ ] `registerAccountCoreIpc.ts`
- [ ] `registerMailIpc.ts`
- [ ] `registerDavIpc.ts`
- [ ] `registerComposeIpc.ts`
- [ ] Add shared broadcast helper (`broadcastToAllWindows` + typed wrappers).
- [ ] Keep existing channel names unchanged.
- [ ] Keep preload contract unchanged.
- [ ] Update main bootstrap registration in `src/main/index.ts`.

### Exit Criteria

- [ ] Monolithic `accounts.ts` removed or reduced to orchestration.
- [ ] No channel naming regressions.
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

- [ ] Add `src/renderer/lib/ipcClient.ts` with typed wrappers.
- [ ] Add `useIpcEvent` hook for safe subscribe/unsubscribe.
- [ ] Add shared hooks:
- [ ] `useAccounts()`
- [ ] `useAppSettings()`
- [ ] `useAutoUpdateState()`
- [ ] `useWindowControlsState()`
- [ ] Replace repeated page-level `window.electronAPI.on...` wiring with hooks.
- [ ] Preserve optimistic behavior for user-visible actions.

### Exit Criteria

- [ ] Event subscription boilerplate reduced across pages.
- [ ] No regressions on unread/account/update indicators.
- [ ] Build and smoke checks pass.

---

## Phase 4: Split Large Renderer Containers

### Target files

- `src/renderer/MainWindowApp.tsx`
- `src/renderer/pages/MailPage.tsx`
- `src/renderer/layouts/MainLayout.tsx`

### Checklist

- [ ] Extract route modules:
- [ ] `src/renderer/routes/ContactsRoute.tsx`
- [ ] `src/renderer/routes/CalendarRoute.tsx`
- [ ] Keep `MainWindowApp` as shell/router orchestration.
- [ ] Extract Mail hooks:
- [ ] `useMailSelection`
- [ ] `useMailSyncStatus`
- [ ] `useMessageBodyLoader`
- [ ] `useOptimisticReadState`
- [ ] Split `MainLayout` into reusable subcomponents (folder panel, message list, menus, table config).
- [ ] Move date helper functions to `src/renderer/lib/date/`.
- [ ] Remove local theme duplication and use `useAppTheme` consistently.

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

- [ ] Define rule: Drizzle by default for new repository code.
- [ ] Identify hot paths where raw SQL is still justified.
- [ ] Migrate high-churn paths first:
- [ ] folder/message list reads
- [ ] read/unread flows
- [ ] move/archive/delete flows
- [ ] Add comments for any intentionally retained raw SQL.
- [ ] Document DB access conventions in `docs/`.

### Exit Criteria

- [ ] New data access is strongly typed by default.
- [ ] Raw SQL usage is explicit and justified.
- [ ] Build and smoke checks pass.

---

## Phase 6: Async State Standardization (React Query + Optional Zustand)

### Checklist

- [ ] Add QueryClient provider in renderer entrypoint.
- [ ] Migrate first query set:
- [ ] accounts
- [ ] folders
- [ ] app settings
- [ ] Migrate first mutation set with optimistic updates:
- [ ] read/unread
- [ ] flag/tag
- [ ] move/archive/delete
- [ ] Use Zustand only for cross-route local UI state that should persist.
- [ ] Remove redundant manual loading/error state where Query handles it.

### Exit Criteria

- [ ] Fetching/invalidation behavior is consistent across pages.
- [ ] Optimistic flows remain immediate and resilient.
- [ ] Build and smoke checks pass.

---

## Phase 7: Shared Type Contracts + Preload Hardening

### Checklist

- [ ] Move shared IPC payload/result types into a common shared module.
- [ ] Centralize shared app settings defaults/options in `src/shared/` and consume from main + renderer.
- [ ] Keep `src/preload/index.ts` as single renderer bridge surface.
- [ ] Add runtime validation to riskier IPC payload entry points.
- [ ] Verify security constraints remain intact:
- [ ] `contextIsolation = true`
- [ ] `nodeIntegration = false`
- [ ] no renderer direct Node/FS/IMAP access

### Exit Criteria

- [ ] Type drift between preload/main/renderer is reduced.
- [ ] Security contract unchanged or improved.
- [ ] Build and smoke checks pass.

---

## Phase 8: Tests and Tooling Safety Net

### Checklist

- [ ] Add unit tests for extracted pure logic first:
- [ ] date helpers
- [ ] selection logic
- [ ] optimistic reducers/state transitions
- [ ] Add integration coverage for critical IPC workflows.
- [ ] Add lint/check rules for:
- [ ] large-file warning thresholds
- [ ] discouraged direct event boilerplate patterns
- [ ] Keep build and smoke checks required in PR template.

### Exit Criteria

- [ ] Refactors are safer due to automated guardrails.
- [ ] Regression detection improves before manual QA.

---

## PR Sequence Tracker

- [ ] PR-A: Window factory + shared shortcuts.
- [ ] PR-B: IPC modular split + broadcast helpers.
- [ ] PR-C: Renderer IPC client + shared hooks.
- [ ] PR-D: `MainWindowApp` route extraction + date utilities.
- [ ] PR-E: `MailPage` hook extraction + `MainLayout` decomposition.
- [ ] PR-F: Drizzle-first migration on core mail paths.
- [ ] PR-G: React Query rollout + optimistic mutation utilities.
- [ ] PR-H: tests and tooling hardening.

---

## Definition of Done

- [ ] Core renderer pages are modular and maintainable.
- [ ] IPC is domain-modular with shared broadcast patterns.
- [ ] Window setup is centralized.
- [ ] Shared hooks cover common fetch/subscription needs.
- [ ] DB access strategy is consistent and documented.
- [ ] Build + smoke tests remain stable through the full sequence.
