# Tutorial Changelog

## 2026-07-23
- Added a separate Builder practice guide ("Practice: edit a pipeline") beside the overview page tour.
- Practice guide is sidebar-only: load RDF Base → auto-select/remove fusion_first_value → add back → reconnect button → export.
- Canvas clicks are intentionally avoided (driver.js overlays block reliable React Flow interaction).
- Added a Results practice guide ("Practice: compare results"): select R_A → R_B → explain Data Artifacts → open Data View → Run Query.
- Added a Leaderboard practice guide ("Practice: rebuild ranking"): clear selection/groups → select R_A/R_B/R_C → add Accuracy + Coverage → assign metrics → Figure view.
- Tutorial steps can declare `advanceOn` event gates; pages emit matching `kgpipe-tutorial:*` window events.

## 2026-06-18
- Added optional, page-specific onboarding tours powered by `driver.js`.
- Kept tutorial code isolated under `frontend/src/tutorial/` with separate files for the button, driver setup, steps, and shared types.
- Added stable `data-tutorial` anchors to top-level UI regions instead of coupling tours to styling classes.
- Initial tour depth is intentionally compact: page orientation, primary controls, and core KGpipe concepts only.
- Added a `Learn` page for Knowledge Graph basics: entities, triples, RDF, SPARQL, pipelines, metrics, and rankings.
- Changed tutorial copy to a bilingual EN/DE model with English as the default language.
- Replaced direct `?` tour start with a compact help menu offering page tour, Learn page, and language selection.
- Persisted tutorial language in localStorage under `kgpipe-tutorial-language`.
- Added a Builder-specific help-button offset to reduce overlap with the React Flow minimap.

## Ideas
- Add more interactive "try this now" tutorial steps on other pages, reusing `advanceOn` event gates.
- Add a "do not show again" or "last completed" state via localStorage if tours become auto-started later.
- Add small contextual one-step highlights for newly added features.
- Add full UI localization if the rest of the app should become bilingual, not only tutorial/help content.
- Add deep links such as `?page=builder&tutorial=1` to start tours from Learn cards.

## TODOs
- Manually test popover placement on small screens and adjust the help button offset if it collides with React Flow controls.
- Revisit copy once real task metadata replaces the current empty `/tasks` response.
- Review German copy for tone if the app later targets German-first users; current default and primary wording is English.
