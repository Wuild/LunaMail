## Summary

- What changed:
- Why:

## Validation (Required)

- [ ] `npm run build` completed successfully on this branch.
- [ ] Smoke checklist executed: `docs/SMOKE_TEST_CHECKLIST.md`.
- [ ] Smoke evidence included in this PR description (pass/fail notes + date).

## Risk Review

- [ ] Preload IPC surface unchanged or intentionally updated with matching main/renderer contracts.
- [ ] Security posture preserved (`contextIsolation: true`, `nodeIntegration: false`, no direct renderer Node access).
- [ ] Any retained raw SQL is explicitly justified in code comments.

## Notes

- Follow-up work / known limitations:
