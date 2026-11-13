# Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Document Canvas - Research

**Researched:** 2026-11-13
**Status:** Complete

## Technical Findings

1. **Paginated Physical Sheet Geometry in Browser (`WORD-07`, `WORD-08`):**
   - Standard `A4` Portrait is `210mm × 297mm` (`794px × 1123px` at 96 DPI).
   - By binding CSS custom properties (`--page-width-mm`, `--page-height-mm`, `--margin-top-mm`, `--margin-bottom-mm`, `--margin-left-mm`, `--margin-right-mm`, `--page-columns`, `--canvas-zoom`) onto the paginated sheet container, switching from `A4` to `Letter`/`Legal`/`A3`/`A5` or toggling `Portrait`/`Landscape` immediately reflows the canvas, rulers, header/footer regions, and `@media print` output with 100% WYSIWYG parity.

2. **Contextual Table Engine (`WORD-06`):**
   - Tracking the active `HTMLTableElement`, `HTMLTableRowElement`, and `HTMLTableCellElement` from `window.getSelection()` enables deterministic DOM manipulation for:
     - Inserting/deleting rows and columns.
     - Merging cells across rows/columns (`colSpan` / `rowSpan`) and splitting merged cells back into individual `<td>` elements.
     - Marking any `<tr>` with `data-repeater="true"` and `data-repeater-table="TableName"` (visually badged in the canvas with a repeating data row indicator) and `<thead>`/`<tr>` with `data-repeat-header="true"`.
     - Inserting a Table Summary Footer row (`<tr data-summary-footer="true">`) supporting `SUM`, `COUNT`, `AVG`, `MIN`, `MAX` aggregate tags.

