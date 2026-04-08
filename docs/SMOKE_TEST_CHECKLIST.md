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
