# Tutorials and practice guides

**Code:** `frontend/src/tutorial/`

## Page tours

Every page offers **Start page tour** from the `?` help menu (EN/DE, language stored in `localStorage`). Tours use driver.js and `data-tutorial` anchors.

## Practice guides

| Page | Menu label | Flow (summary) |
|------|------------|----------------|
| Pipeline Editor | Practice: edit a pipeline | Load RDF Base → remove/add `fusion_first_value` → reconnect → export |
| Pipeline Results | Practice: compare results | Select R_A → R_B → Data Artifacts → Data View → Run Query |
| Pipeline Leaderboard | Practice: rebuild ranking | Clear → R_A/R_B/R_C → Accuracy + Coverage → assign metrics → Distribution |

Practice steps advance on real UI events (`kgpipe-tutorial:*`). Builder practice avoids canvas dragging (sidebar reconnect helper) because overlays interfere with React Flow.

## Export reminder (builder practice)

The final builder practice steps stress that export is for **external** execution; see [Run & reimport](../run-and-reimport.md).
