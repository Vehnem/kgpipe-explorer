# Tutorial Changelog

## 2026-06-18
- Added optional, page-specific onboarding tours powered by `driver.js`.
- Kept tutorial code isolated under `frontend/src/tutorial/` with separate files for the button, driver setup, steps, and shared types.
- Added stable `data-tutorial` anchors to top-level UI regions instead of coupling tours to styling classes.
- Initial tour depth is intentionally compact: page orientation, primary controls, and core KGpipe concepts only.

## Ideas
- Add a deeper "for beginners" mode with more KGpipe/domain background.
- Add a "do not show again" or "last completed" state via localStorage if tours become auto-started later.
- Add small contextual one-step highlights for newly added features.
- Add German/English text switching if the rest of the UI becomes localized.

## TODOs
- Manually test popover placement on small screens and adjust the help button offset if it collides with React Flow controls.
- Revisit copy once real task metadata replaces the current empty `/tasks` response.
