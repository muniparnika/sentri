## What does this PR do?

<!-- One paragraph. What problem does it solve, and how? -->

## Linked issue

Closes #<!-- issue number — PRs without a linked issue for non-trivial changes are closed -->

## Type of change

- [ ] Bug fix
- [ ] New feature (exists in ROADMAP.md)
- [ ] Refactor / performance improvement
- [ ] Documentation / tests only

## Checklist

- [ ] PR title follows Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, etc.)
- [ ] Branch is off `develop`, not `main`
- [ ] `cd backend && npm test` passes locally
- [ ] `cd frontend && npm run build && npm test` passes locally
- [ ] New/modified backend logic has tests registered in `backend/tests/run-tests.js`
- [ ] `docs/changelog.md` updated under `## [Unreleased]` (user-visible changes only)
- [ ] `QA.md` walked for affected flows; Golden E2E re-run if core flow was touched
- [ ] `permissions.json` updated if a `requireRole()` gate was added/changed
- [ ] ROADMAP.md + NEXT.md updated if this closes a roadmap item (see REVIEW.md)
- [ ] No secrets, API keys, or credentials in the diff

## How to test

<!-- Step-by-step instructions a reviewer can follow to verify this works. -->

1. 
2. 
3. 

## Screenshots (if UI changed)

<!-- Delete this section if not applicable -->
