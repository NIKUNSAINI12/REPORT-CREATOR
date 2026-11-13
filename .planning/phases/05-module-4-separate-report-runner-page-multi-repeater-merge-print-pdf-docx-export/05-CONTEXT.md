# Phase 5: Module 4 — Separate Report Runner Page, Multi-Repeater Merge, Print, PDF & DOCX Export - Context

**Gathered:** 2026-11-13
**Status:** Complete

<domain>
## Phase Boundary

Deliver the dedicated **Report Runner & Export Engine** (`/reports` and `/reports/run/:templateId` + `/api/reports/*`) (`EXEC-01`..`EXEC-04`):
1. **Separate Report Runner Page & Dynamic Filter Input Panel (`EXEC-01`):**
   - Renders configured runtime filters (`Dropdown` with `SELECT DISTINCT TOP 500` lookup, `MultiSelect`, `DateRangePicker`, `DatePicker`, `NumberInput`, `Checkbox`, `Text`) and supports direct URL query-parameter execution (`/reports/run/:id?DocId=123`).
   - Validates required filters and binds all filter inputs via parameterized SQL (`@Param0`, `@Param1` with `IN` and `BETWEEN` expansion).
2. **Cartesian-Free Multi-Repeater Row Deduplication (`EXEC-02`):**
   - Deduplicates repeating rows per `1:N` repeater table within each parent record group so multiple repeating tables never multiply rows into a Cartesian product.
3. **Single/Batch Document Mode & Summary List Mode (`EXEC-03`):**
   - Groups master rows by Anchor Primary Key (`[__AnchorPK]`) to render 1 merged paginated document per master record (with repeating child rows, `SUM/COUNT/AVG/MIN/MAX` footer aggregates, formatted dates/currencies, and system tokens `Page X of Y`), or renders a continuous register in `SummaryList` mode.
4. **Browser Print Preview, PDF Export & Word (.docx) Export (`EXEC-04`):**
   - Provides Browser Print Preview (`window.print()` with `@media print` page breaks), PDF stream download (`/api/reports/:id/export/pdf`), and native OpenXML Word `.docx` download (`/api/reports/:id/export/docx` using `DocumentFormat.OpenXml` preserving `PageSize`, `PageMargin`, `Columns`, headers/footers, tables, and batch page breaks).

</domain>
