# Requirements: Dynamic Word-Like Report Designer & SQL Query Engine

**Defined:** 2026-11-13
**Core Value:** Users can visually design MS Word-fidelity paginated report templates using governed database fields that automatically compile into safe, shortest-path `LEFT JOIN` T-SQL queries—and accurately generate merged single/batch PDF and DOCX documents on a dedicated execution page without writing a single line of SQL.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Database Foundation, Schema Discovery & FK Multigraph (`SCHEMA`)

- [x] **SCHEMA-01**: System provides and executes SQL DDL scripts for `Report_Field_Catalog`, `Report_Custom_Relationships` (virtual FKs), and `Saved_Report_Templates` in `TMS_Lite_1_Oct_2026`.
- [x] **SCHEMA-02**: Backend connects to SQL Server (`localhost` / `TMS_Lite_1_Oct_2026`) via configuration (`appsettings.json`) and introspects `INFORMATION_SCHEMA.TABLES` (`404` tables) and `INFORMATION_SCHEMA.COLUMNS` (`5,993` columns) with data types and nullability.
- [x] **SCHEMA-03**: Backend introspects `sys.foreign_keys`, `sys.foreign_key_columns`, `sys.tables`, and `sys.columns` (`341` FKs) and merges them with `Report_Custom_Relationships` to build an in-memory **Labeled Multigraph** supporting single-column, composite (`14` multi-column FKs), self-referencing (`5` self-FKs), and multiple FKs between the same two tables (`14` multi-FK pairs).
- [x] **SCHEMA-04**: BFS Reachability Service computes shortest valid join paths from active canvas tables, returning reachable tables, relationship roles (when multiple FKs exist between two tables), and blocking accidental `N -> 1 <- N` chasm/fan-trap paths through shared master lookup tables.

### Module 1: Manager Data Dictionary & Virtual Relationship Portal (`MGR`)

- [x] **MGR-01**: Manager Portal displays a searchable, grouped, virtual-scrolled list of all `404` tables and `5,993` columns from `TMS_Lite_1_Oct_2026` without browser lag.
- [x] **MGR-02**: Manager can toggle any column as **Published / Active (`IsActive`)**, assign a **Presentable Alias (`DisplayName`)**, set a **Category/Group Name (`Category`)**, and toggle **Is Filterable (`IsFilterable`)**, persisted in `Report_Field_Catalog`.
- [x] **MGR-03**: Manager Portal provides **Auto-Humanize Alias** generation (e.g., `Consignment_No` → `"Consignment No"`, auto-inferring category from table prefix) and **Bulk Publish/Unpublish** per table.
- [x] **MGR-04**: Manager can create and delete **Virtual / Custom Foreign Key Relationships** (`ParentTable.Column <-> ReferencedTable.Column`) in the Manager Portal so any of the `151` tables lacking physical DB foreign keys can participate in report joins.
- [x] **MGR-05**: Publishing or updating fields or custom relationships immediately invalidates/updates the backend cache and exposes changes in the End-User Report Designer sidebar in real time without a server restart.

### Module 2A: MS Word Ribbon & Paginated Document Canvas (`WORD`)

- [x] **WORD-01**: Designer renders a multi-tab MS Word Ribbon UI (`Home`, `Insert`, `Table Design & Layout`, `Layout`, `View`) above a paginated, ruler-equipped WYSIWYG canvas.
- [x] **WORD-02**: **Clipboard & History**: Supports Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Cut, Copy, Paste (with formatting & plain text), Format Painter, and Find & Replace dialog.
- [x] **WORD-03**: **Typography & Font Formatting (Home Tab)**: Supports Font Family selector (Arial, Calibri, Times New Roman, Roboto, Georgia, Courier New, etc.), Font Size (8pt–72pt + increment/decrement), Bold, Italic, Underline (single, double, dotted), Strikethrough, Subscript (`X₂`), Superscript (`X²`), Change Case (UPPERCASE, lowercase, Title Case, Sentence case), Text Color, Highlight Color, Clear Formatting, and Quick Heading Styles gallery (`Normal`, `Title`, `Subtitle`, `Heading 1–6`, `Quote`).
- [x] **WORD-04**: **Paragraph & List Formatting (Home Tab)**: Supports Alignment (Left, Center, Right, Justify), Bulleted Lists (disc, circle, square), Numbered Lists (`1,2,3`, `a,b,c`, `i,ii,iii`), Multi-level Nested Lists, Indentation (Increase/Decrease + first-line/hanging indent via horizontal ruler), Line & Paragraph Spacing (`1.0`, `1.15`, `1.5`, `2.0`, custom before/after), and Paragraph Borders & Shading.
- [x] **WORD-05**: **Insert Elements (Insert Tab)**: Supports interactive `NxM` Table grid selector + Custom Table dialog, Images (local upload/company logo, URL, inline vs. floating wrap, aspect-ratio resize handles, alignment), Shapes & Dividers (`<hr>`, rectangular callout/text boxes, signature lines), Hyperlinks, Editable Repeating Header & Footer zones, System Tokens (`Page X of Y`, `Current Date`, `Current Time`, `Printed By`), Explicit Page Break (`Ctrl+Enter`) & Section Break, and Special Characters (`₹`, `$`, `€`, math, `©`, `™`).
- [x] **WORD-06**: **Contextual Table Design & Layout Tools**: Appears when cursor is inside a table; supports Insert Row Above/Below, Insert Column Left/Right, Delete Row/Column/Table, Merge Selected Cells, Split Cell, Cell Properties (background shading, Top/Middle/Bottom vertical alignment, cell padding, custom border styles/width/color/dashed/solid), Toggle **Header Row Repeat** across page breaks, and Toggle **Repeating Data Row** (`Data Repeater Row`).
- [x] **WORD-07**: **Page Setup & Document Layout (Layout Tab)**: Supports Page Size (`A4` 210mm×297mm, `Letter`, `Legal`, `A3`, `A5`, Custom), Orientation (`Portrait` / `Landscape`), Margins (`Normal`, `Narrow`, `Moderate`, `Wide`, Custom Top/Bottom/Left/Right in mm/inches), Columns (`1`, `2`, `3` columns), and Watermark (custom diagonal/horizontal text like `"DRAFT"`/`"CONFIDENTIAL"` or image watermark behind page content).
- [x] **WORD-08**: **View & Canvas Aids (View Tab)**: Supports Zoom slider (`50%` to `200%`, Fit to Page, Fit to Width), Toggle Horizontal & Vertical Rulers, Toggle Table Gridlines (dotted borders when borders are none), and toggle between Print Layout View and Live Data Preview Mode.

### Module 2B, 2C & Module 3: Field Binding, FK Locking, Filter Builder & SQL Compiler (`BIND`)

- [x] **BIND-01**: **Zero-State & Anchor-State FK Reachability Locking**: When the canvas has 0 database fields, all published sidebar fields are enabled; once the first field is dropped (Anchor Table), and on every subsequent field drop or removal, BFS runs across the FK graph and visually locks/disables unreachable fields (greyed out, drag disabled, tooltip: `"Cannot add: No Foreign Key relationship with selected tables"`). Removing all fields unlocks all sidebar fields.
- [x] **BIND-02**: **Role-Playing FK Disambiguation on Drop**: When dropping a field from a table connected via multiple foreign keys along the join path (e.g., `CL_Thc_Header` -> `CL_Master_Location` Origin vs. Destination, or Driver 1 vs. Driver 2), the Designer prompts the user to select which FK relationship role to use and assigns a unique role alias so the same master table can be used multiple times in one report.
- [x] **BIND-03**: **Inline Scalar Merge Tags & Repeating Table Row Binding**: Supports dropping fields as inline scalar merge tags (`{{TableName.DisplayName}}`) in paragraphs/headers/summary cells and inside table rows marked as `Data Repeater Row` (`<tr data-repeater="true">`), plus Table Footer Aggregate functions (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`).
- [x] **BIND-04**: **Inline Field Formatting**: Right-clicking a dropped field pill opens a formatting popover to configure Date format (`DD-MM-YYYY`, etc.), Currency/Number format (`₹ #,##0.00`), Text Case (`UPPERCASE`, etc.), Aggregate function, and Default value if `NULL`.
- [x] **BIND-05**: **Runtime Filter Builder**: Allows configuring runtime filters using any published field reachable in the active FK graph, storing `FieldId`, `FilterLabel`, `Operator` (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`), auto-mapped `UIControlType` (`DateRangePicker` for `date/datetime`, `MultiSelect/Dropdown` or `Text` for `varchar`, `Numeric` for `int/decimal`, `Checkbox` for `bit`), and `IsRequired`.
- [x] **BIND-06**: **Template Persistence & Dynamic T-SQL Compiler**: Saving a template persists `LayoutJson`, `QueryMetadataJson` (`SelectedFields`, ordered `JoinPath` including intermediate bridge tables, composite FK join predicates, and role aliases, `FilterConfig`, and `DocumentMode`), and auto-generated bracket-quoted `CompiledSelectQuery` using `LEFT JOIN` and `WHERE 1=1 /*DYNAMIC_FILTERS*/` in `Saved_Report_Templates`.

### Module 4: Separate Report Runner Page, Multi-Repeater Execution & Export (`EXEC`)

- [x] **EXEC-01**: **Dedicated Report Runner Page & Direct URL Execution**: Provides a separate Angular page (`/reports/run/:templateId` and report catalog list `/reports`) that renders the dynamic Filter Input Panel (`FilterConfig`), auto-populates `Dropdown / MultiSelect` filter options via `SELECT DISTINCT TOP 500`, and also supports direct URL query-parameter execution (e.g., `/reports/run/5?Tripsheet_Id=1042&autoRun=true`) to immediately generate reports for a selected document/record.
- [x] **EXEC-02**: **Parameterized Query Execution & Multi-Repeater Deduplication**: Validates required filters, binds all filter inputs via parameterized SQL (`@Param0`, `@Param1`, expanding `IN` and `BETWEEN` safely with zero SQL injection risk), executes against `TMS_Lite_1_Oct_2026`, and executes/deduplicates multiple `1:N` repeating tables independently per parent record to prevent Cartesian product multiplication.
- [x] **EXEC-03**: **Master-Detail Document Merge Engine**: Merges dataset into `LayoutJson` supporting both **Single/Batch Document Mode** (grouping rows by Anchor PK so each parent record renders as its own page-broken document with scalar tags + repeating detail rows + footer aggregates) and **Summary List Mode**, applying inline field formatting (`DD-MM-YYYY`, `₹ #,##0.00`, null defaults) and calculating dynamic page counts (`Page X of Y`).
- [x] **EXEC-04**: **Print Preview, PDF & Word (`.docx`) Export**: Provides high-fidelity **Browser Print Preview**, **Download as PDF** (`PuppeteerSharp` / paged print rendering), and **Download as Word (`.docx`)** (`DocumentFormat.OpenXml`) faithfully preserving page size, orientation, margins, headers/footers, watermarks, tables, repeating header rows, and typography styles.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Automation & Charting

- **AUTO-01**: Scheduled cron-based email delivery of PDF/DOCX reports to stakeholders
- **CHART-01**: Embedded visual chart widgets (bar, line, pie charts) inside Word report templates
- **VER-01**: Template revision history and diff rollback in `Saved_Report_Templates`

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Freehand raw SQL query editor for end-users | Bypasses field governance and introduces SQL injection / Cartesian join risks |
| Data mutation (`INSERT`/`UPDATE`/`DELETE`) via reports | Reporting engine must strictly enforce read-only execution against `TMS_Lite_1_Oct_2026` |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 1 | Complete |
| SCHEMA-02 | Phase 1 | Complete |
| SCHEMA-03 | Phase 1 | Complete |
| SCHEMA-04 | Phase 1 | Complete |
| MGR-01 | Phase 2 | Complete |
| MGR-02 | Phase 2 | Complete |
| MGR-03 | Phase 2 | Complete |
| MGR-04 | Phase 2 | Complete |
| MGR-05 | Phase 2 | Complete |
| WORD-01 | Phase 3 | Complete |
| WORD-02 | Phase 3 | Complete |
| WORD-03 | Phase 3 | Complete |
| WORD-04 | Phase 3 | Complete |
| WORD-05 | Phase 3 | Complete |
| WORD-06 | Phase 3 | Complete |
| WORD-07 | Phase 3 | Complete |
| WORD-08 | Phase 3 | Complete |
| BIND-01 | Phase 4 | Complete |
| BIND-02 | Phase 4 | Complete |
| BIND-03 | Phase 4 | Complete |
| BIND-04 | Phase 4 | Complete |
| BIND-05 | Phase 4 | Complete |
| BIND-06 | Phase 4 | Complete |
| EXEC-01 | Phase 5 | Complete |
| EXEC-02 | Phase 5 | Complete |
| EXEC-03 | Phase 5 | Complete |
| EXEC-04 | Phase 5 | Complete |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-11-13*
*Last updated: 2026-11-13 after initial definition and gap analysis*
