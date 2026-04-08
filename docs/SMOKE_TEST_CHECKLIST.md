# LunaMail Smoke Test Checklist

Use this checklist after each refactor PR.

## Steps

- [ ] Launch app successfully.
- [ ] Inbox opens and message list loads.
- [ ] Compose window opens and closes correctly.
- [ ] Message window opens and closes correctly.
- [ ] Settings routes load:
- [ ] `/settings/application`
- [ ] `/settings/developer`
- [ ] `/settings/account?accountId=<id>`
- [ ] Account actions work:
- [ ] add account
- [ ] update account
- [ ] delete account
- [ ] Update indicator still navigates to `/settings/application`.
- [ ] Main titlebar controls still work (minimize, maximize/restore, close).
- [ ] Build passes (`npm run build`).

## Latest Run Log

- 2026-04-07: `npm run build` passed during Phase 1 (window factory refactor).
- 2026-04-07: `npm run build` passed during Phase 2 (IPC modularization refactor).
- 2026-04-07: `npm run build` passed during Phase 3 foundation (IPC hooks/client rollout).
- 2026-04-07: `npm run build` passed after Phase 4 date utility extraction.
- 2026-04-07: `npm run build` passed after MailPage theme-hook consolidation.
- 2026-04-07: `npm run build` passed after MainWindowApp route/component extraction prep.
- 2026-04-07: `npm run check:architecture` passed (large-file threshold + IPC event boilerplate detection).
- 2026-04-07: `npm run test:unit` passed (date/format helpers, selection logic, optimistic reducers, IPC contract
  integration).
- 2026-04-07: `npm run test:unit` passed (added event-subscription integration coverage + strict preload↔main
  invoke/handle parity check).
- 2026-04-07: `npm run build` passed after Phase 7 shared contract extraction and IPC runtime validation updates.
- 2026-04-07: Manual UI smoke run pending.
- 2026-04-08: `npm run check:architecture` passed after splitting CloudFilesPage helpers (`CloudFilesPage.tsx` back
  under 2000 lines).
- 2026-04-08: `npm run test:unit` passed.
- 2026-04-08: `npm run build` passed.
- 2026-04-08: `npm run check:architecture` passed after IPC runtime validation hardening.
- 2026-04-08: `npm run test:unit` passed after IPC runtime validation hardening.
- 2026-04-08: `npm run build` passed after IPC runtime validation hardening.
- 2026-04-08: `npm run check:architecture` passed after `MainLayout` decomposition (menubar + table config extraction).
- 2026-04-08: `npm run test:unit` passed after `MainLayout` decomposition.
- 2026-04-08: `npm run build` passed after `MainLayout` decomposition.
- 2026-04-08: `npm run check:architecture` passed after AppSettings mail filter Query migration.
- 2026-04-08: `npm run test:unit` passed after AppSettings mail filter Query migration.
- 2026-04-08: `npm run build` passed after AppSettings mail filter Query migration.
- 2026-04-08: `npm run check:architecture` passed after AppSettings account subscription dedup (`useAccounts`).
- 2026-04-08: `npm run test:unit` passed after AppSettings account subscription dedup.
- 2026-04-08: `npm run build` passed after AppSettings account subscription dedup.
- 2026-04-08: `npm run check:architecture` passed after replacing remaining direct `window.electronAPI` renderer calls
  with `ipcClient`.
- 2026-04-08: `npm run test:unit` passed after `window.electronAPI` call replacement.
- 2026-04-08: `npm run build` passed after `window.electronAPI` call replacement.
- 2026-04-08: `npm run check:architecture` passed after account/folder collapse-state persistence updates.
- 2026-04-08: `npm run test:unit` passed after account/folder collapse-state persistence updates.
- 2026-04-08: `npm run build` passed after account/folder collapse-state persistence updates.
- 2026-04-08: `npm run check:architecture` passed after titlebar-style restart flow change.
- 2026-04-08: `npm run test:unit` passed after titlebar-style restart flow change.
- 2026-04-08: `npm run build` passed after titlebar-style restart flow change.
- 2026-04-08: `npm run check:architecture` passed after native/custom titlebar state sync fixes.
- 2026-04-08: `npm run test:unit` passed after native/custom titlebar state sync fixes.
- 2026-04-08: `npm run build` passed after native/custom titlebar state sync fixes.
