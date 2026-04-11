## Summary

Describe what this PR changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Security improvement

## Validation (Required)

- [ ] `npm run build` completed successfully on this branch.
- [ ] `npm run check:architecture` completed successfully on this branch.
- [ ] `npm run test:unit` completed successfully on this branch.

## Risk Review

- [ ] Preload IPC surface unchanged or intentionally updated with matching main/renderer contracts.
- [ ] Security posture preserved (`contextIsolation: true`, `nodeIntegration: false`, no direct renderer Node access).
- [ ] Any retained raw SQL is explicitly justified in code comments.

## Notes

- Follow-up work / known limitations:
