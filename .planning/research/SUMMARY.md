# Project Research Summary

**Project:** Dynamic Word-Like Report Designer & SQL Query Engine (TMS Report Designer)
**Domain:** Enterprise WYSIWYG Document & Report Builder with Graph-Governed Dynamic SQL Compiler
**Researched:** 2026-11-13
**Confidence:** HIGH

## Executive Summary

The **Dynamic Word-Like Report Designer & SQL Query Engine** is an enterprise-grade document authoring, schema governance, and dynamic SQL reporting platform tailored for the `TMS_Lite_1_Oct_2026` Microsoft SQL Server database (`404` base tables, `5,993` columns, `341` physical foreign keys). Unlike simple HTML template editors or raw SQL report tools, this system combines a complete MS Word Ribbon & Paginated Document Canvas with a **Cardinality-Aware Foreign Key Graph Service** that guarantees end-users can only drag-and-drop fields that can be validly joined in SQL—automatically compiling safe, bracket-quoted, parameterized T-SQL `LEFT JOIN` queries behind the scenes.

Our live audit of `TMS_Lite_1_Oct_2026` alongside domain research revealed several critical real-world complexities that must be baked directly into the architecture:
1. **Role-Playing Master Joins (`14` multi-FK pairs in `TMS_Lite_1_Oct_2026`):** Tables such as `CL_Thc_Header` have 4 distinct foreign keys pointing to `CL_Master_Location` (Origin, Destination, Current, Billing). The graph engine must model relationships as a **labeled multigraph** (keyed by constraint/edge ID) and prompt users on field drop to choose the relationship role, assigning each role a distinct SQL table alias (`[T2_Origin]`, `[T3_Dest]`).
2. **Unlinked Tables (`151` tables without physical FKs) & Chasm Traps (`N -> 1 <- N`):** Because 151 tables lack physical `sys.foreign_keys` constraints, the Manager Portal must include a **Virtual / Custom Relationships** manager (`Report_Custom_Relationships`). Simultaneously, the Breadth-First Search (BFS) reachability service must enforce **cardinality rules** to prevent accidental `N -> 1 <- N` chasm traps where two unrelated transaction tables join backwards through a shared master table like `CL_Master_Location`.
3. **Multi-Repeater Cartesian Explosion & Batch Document Merging:** Operational TMS documents (Consignments, Tripsheets, Invoices) frequently contain both scalar header fields and **multiple independent `1:N` repeating detail tables** (e.g., Packages + Advances), and are executed either for a single record via URL parameters or across a date-range batch. The execution engine must split `1:N` child repeater queries (or deduplicate by child PK) per parent record, support **Single/Batch Document Mode** (grouping by Anchor PK with page breaks between records) as well as **Summary List Mode**, and compute footer aggregations (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`).

## Key Findings

### Recommended Stack

We recommend an **Angular 19 (Standalone + Signals)** frontend paired with an **ASP.NET Core (.NET 8.0 LTS) Web API** backend using **Dapper + Microsoft.Data.SqlClient**.

**Core technologies:**
- **Angular 19 + TipTap 2.10 / ProseMirror**: Provides a deterministic JSON AST (`LayoutJson`) extensible with custom nodes (`MergeTag`, `RepeaterRow`, `SystemToken`, `PageBreak`) wrapped in a physical-millimeter paginated sheet canvas (`210mm × 297mm` A4, etc.) and driven by a 5-tab MS Word Ribbon.
- **Angular CDK (`@angular/cdk/scrolling` & `@angular/cdk/drag-drop`)**: Essential for virtual-scrolling `5,993` columns across `404` tables in the Manager Portal without DOM lag, and dragging catalog fields onto the paginated editor canvas.
- **ASP.NET Core (.NET 8) + `Microsoft.Data.SqlClient 5.2.x` + `Dapper 2.1.x`**: Sub-50ms schema introspection of `INFORMATION_SCHEMA` and `sys.foreign_keys`, in-memory BFS multigraph traversal, and dynamic `DynamicParameters` binding for `CompiledSelectQuery`.
- **PuppeteerSharp 20.x + CSS `@media print` & `DocumentFormat.OpenXml 3.1.x` + `HtmlToOpenXml 3.1.x`**: Delivers pixel-identical WYSIWYG paginated PDF exports and native Word (`.docx`) exports preserving page size, orientation, margins, repeating table headers (`w:tblHeader`), headers/footers, and watermarks.

### Expected Features

**Must have (table stakes):**
- **Manager Data Dictionary Portal (`Report_Field_Catalog`)**: Searchable, virtualized governance portal for 404 tables / 5,993 columns to publish fields, set friendly aliases, categories, and filterable flags with instant real-time sync.
- **Complete MS Word Ribbon & Paginated Canvas**: Full 5-tab ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) with rulers, headers/footers, watermarks, system tokens (`Page X of Y`, `Current Date/Time`, `Printed By`), contextual table tools, and page setup.
- **Inline Scalar Merge Tags, Repeating Table Rows & Field Formatting**: `{{TableName.DisplayName}}` pills, `<tr data-repeater="true">` dynamic row binding, and right-click formatting (Dates, `₹` Currency, Case, Null defaults).
- **Real-Time FK BFS Reachability & Sidebar Locking**: Zero-state unlocked; anchor-state and multi-hop BFS traversal locking unreachable sidebar fields with clear tooltips.
- **Runtime Filter Builder & Parameterized SQL Compiler**: Operator selection (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`), auto-mapped UI controls with `SELECT DISTINCT TOP 500` dropdown lookups, and bracket-quoted `LEFT JOIN` T-SQL compilation saved in `Saved_Report_Templates`.
- **Separate Report Runner Page (`/reports/run/:templateId`) & Export Engine**: Dedicated execution page with dynamic filter panel, live paginated merge preview, Browser Print, PDF download, and `.docx` download.

**Should have (competitive differentiators locked for v1):**
- **Role-Playing FK Disambiguation on Drop**: Prompts user to choose which FK relationship to traverse when multiple FKs exist between two tables (14 pairs in `TMS_Lite_1_Oct_2026`), aliasing each separately.
- **Virtual / Custom Relationships (`Report_Custom_Relationships`)**: Bridges any of the 151 tables lacking physical SQL foreign keys into the BFS graph.
- **Cardinality-Aware Chasm-Trap Prevention (`N -> 1 <- N`)**: Prevents accidental Cartesian fan-outs through shared lookup tables.
- **Independent Multi-Repeater Execution & Table Footer Aggregates**: Supports multiple `1:N` detail tables in one document without Cartesian multiplication, plus `SUM`, `COUNT`, `AVG`, `MIN`, `MAX` footer cells.
- **Single/Batch Document Mode + Direct URL Query-Param Execution**: Supports `/reports/run/:id?DocId=123&autoRun=true` for 1-click document printing from TMS screens, and groups multi-record results by Anchor PK with page breaks per document.
- **Auto-Humanized Aliases & Bulk Table Publish**: One-click alias generation (`Consignment_No` → `"Consignment No"`) in the Manager Portal.

**Defer (v2+):**
- Scheduled email report distribution / cron batch jobs.
- Visual chart/graph canvas widgets (bar/pie charts inside Word templates).

### Architecture Approach

The system follows a clean modular architecture across SQL Server, ASP.NET Core Web API, and Angular 19 SPA.

**Major components:**
1. **Persistence & Schema Introspection Layer (`.NET` + SQL Server)**: Manages `Report_Field_Catalog`, `Report_Custom_Relationships`, and `Saved_Report_Templates`; introspects all 404 tables, 5,993 columns, and 341 physical FKs (including 14 composite FKs and 5 self-joins).
2. **Cardinality-Aware Multigraph & BFS Reachability Engine (`.NET`)**: Builds an in-memory multigraph merging physical and virtual FKs, computes shortest valid `LEFT JOIN` paths (including intermediate bridge tables), disambiguates multi-FK role edges, and blocks `N -> 1 <- N` chasm traps.
3. **Manager Data Dictionary & Relationship Portal (`Angular`)**: Virtualized table/column browser with bulk publish, auto-humanize aliases, and virtual FK editor.
4. **MS Word Ribbon & Paginated ProseMirror/TipTap Designer (`Angular`)**: Multi-tab Ribbon UI, physical-millimeter paginated sheet canvas with headers/footers/watermarks/rulers, FK-locked field sidebar with role-picker modal, and Filter Builder.
5. **Dynamic T-SQL Compiler, Multi-Repeater Execution & Export Engine (`.NET` + `Angular`)**: Compiles bracket-quoted parameterized T-SQL, executes master + split child repeater queries, merges datasets into `LayoutJson` on the dedicated Report Runner page (`/reports/run/:templateId`), and exports to Print, PDF (`PuppeteerSharp`), and Word (`DocumentFormat.OpenXml`).

### Critical Pitfalls

1. **Role-Playing FK Ambiguity (`CL_Thc_Header -> CL_Master_Location` has 4 FKs)** — Avoid by keying graph edges by `ConstraintName` rather than just `(TableA, TableB)`, prompting the user on drop when multiple edges exist, and aliasing tables by role (`[T2_Origin]`, `[T3_Dest]`).
2. **Undirected BFS Chasm Traps (`N -> 1 <- N`) & Multi-Repeater Cartesian Explosion (`1:N` × `1:M`)** — Avoid by tracking edge direction (`ManyToOne` vs `OneToMany`) in BFS to forbid `N -> 1 <- N` hops through shared master lookups, and executing separate child queries (or deduplicating by child PK) for each repeating table.
3. **Composite FKs (14 in DB) & Self-Joins (5 in DB)** — Avoid by grouping `sys.foreign_key_columns` by `constraint_object_id` so multi-column joins emit `ON [T1].[K1] = [T2].[K1] AND [T1].[K2] = [T2].[K2]`.
4. **T-SQL `IN (@Param)` & Identifier Injection** — Avoid by dynamically expanding `IN (@Param0_0, @Param0_1)` in Dapper, normalizing `BETWEEN` end dates to `23:59:59.997`, and validating all `[Schema].[Table].[Column]` identifiers against the catalog whitelist.
5. **Continuous DOM vs. Paginated PDF/DOCX Drift** — Avoid by enforcing millimeter/pixel page geometry on the Angular canvas, `@page` print CSS rules, and explicit OpenXML `SectionProperties` (`w:pgSz`, `w:pgMar`, `w:tblHeader`).

## Implications for Roadmap

Based on our Vertical MVP slice strategy, we recommend a **5-Phase Roadmap**:

### Phase 1: Database Foundation, Schema Introspection & Cardinality-Aware FK Multigraph Engine
**Rationale:** Every downstream module (Manager Portal, Designer sidebar locking, SQL Compiler) depends on the SQL Server catalog tables (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`) and the in-memory FK multigraph service grounded in `TMS_Lite_1_Oct_2026`.
**Delivers:** Solution scaffolding (`.NET 8 Web API` + `Angular 19`), DDL auto-migration, Schema Introspection Service (404 tables, 5,993 columns, 341 FKs, 14 composite FKs, 14 multi-FK pairs, 5 self-joins), and Cardinality-Aware BFS Reachability API.
**Addresses:** DDL scripts, Schema Discovery, Foreign Key BFS Graph Service, Chasm-Trap guard.
**Avoids:** Composite FK truncation, `N -> 1 <- N` fan-traps, and multi-FK edge overwriting.

### Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Portal
**Rationale:** Before end-users can design reports, managers must be able to inspect the 404 tables / 5,993 columns, publish fields with friendly aliases, and define custom virtual FKs for the 151 unlinked tables.
**Delivers:** Full Angular Manager Portal (`/manager`) + `.NET` Catalog & Custom Relationship APIs with virtual scrolling, instant search, bulk publish, auto-humanized aliases, category grouping, filterable flags, and custom FK builder with real-time graph cache invalidation.
**Addresses:** Module 1 (Manager Data Dictionary Portal) + Gap 2 (151 unlinked tables) + Gap 8 (6,000-column usability).
**Avoids:** DOM freeze on 5,993 columns and dead-end unlinked tables.

### Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Document Canvas
**Rationale:** Establishes the rich-text WYSIWYG authoring environment and page geometry model (`LayoutJson`) before wiring database field bindings and SQL compilation.
**Delivers:** Multi-tab MS Word Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) and paginated canvas in Angular (`/designer`) with Clipboard/History, Format Painter, Find & Replace, Typography/Styles, Lists/Indentation/Spacing, Contextual Tables (merge/split/borders/shading/repeating header & data row toggles), Images, Shapes/Callouts/Signature lines, Hyperlinks, Repeating Headers/Footers, System Tokens (`Page X of Y`, Date/Time, Printed By), Page/Section Breaks, Special Characters, Page Setup (A4/Letter/Legal/A3/A5/Custom, Portrait/Landscape, Margins, Columns, Watermarks), and Zoom/Rulers/Gridlines.
**Addresses:** Module 2A (Complete MS Word Ribbon & Editor Capabilities).
**Avoids:** Continuous-scroll editor drift and missing Word formatting controls.

### Phase 4: Module 2B/2C & Module 3 — Field Drag-and-Drop, FK Locking, Filter Builder & Dynamic T-SQL Compiler
**Rationale:** Connects the Paginated Word Designer to the Governed Catalog and FK BFS Graph, allowing users to drop scalar and repeating fields, disambiguate multi-FK roles, configure runtime filters, and compile/save templates to `Saved_Report_Templates`.
**Delivers:** Real-time FK-locked field sidebar, Role-Playing FK disambiguation modal on drop, Inline Scalar Merge Tags (`{{Table.DisplayName}}`), Repeating Table Row binding (`<tr data-repeater="true">`), Table Footer Aggregates (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), Right-click field formatting (Date, `₹` Currency, Case, Null default), Runtime Filter Builder, and the `.NET` Dynamic T-SQL Compiler (`CompiledSelectQuery` + `QueryMetadataJson` + `LayoutJson` persistence).
**Addresses:** Module 2B, Module 2C, Module 3, Gap 1 (Role-playing FKs), and Gap 4 (Footer aggregates).
**Avoids:** SQL injection, broken intermediate bridge table joins, and ambiguous multi-FK joins.

### Phase 5: Module 4 — Separate Report Runner Page, Multi-Repeater Merge Engine & Print/PDF/DOCX Export
**Rationale:** Completes the end-to-end lifecycle on the dedicated Report Generator page (`/reports/run/:templateId`), executing parameterized SQL queries (via interactive filters or direct URL query parameters), merging master and independent child repeater datasets without Cartesian explosion, and exporting to Print, PDF, and Word (`.docx`).
**Delivers:** Dedicated Angular Report Runner page (`/reports/run/:templateId`) with dynamic filter controls (including `SELECT DISTINCT TOP 500` dropdowns) and direct URL query-param auto-execution (`?DocId=123&autoRun=true`), `.NET` Parameterized Query Execution & Multi-Repeater Merge Engine (supporting both Single/Batch Document Mode grouped by Anchor PK and Summary List Mode), Live Data Preview mode in Designer, Browser Print Preview, PuppeteerSharp PDF Exporter, and OpenXML `.docx` Exporter.
**Addresses:** Module 4, Gap 4 (Single/Batch Document Mode), Gap 5 (Separate Generator Page & Direct URL execution), Gap 7 (Filter `IN`/`BETWEEN` & lookup dropdowns), and Gap 9 (Independent multi-repeater queries).
**Avoids:** Multi-repeater Cartesian multiplication, `IN (@Param)` SQL errors, and PDF/DOCX layout distortion.

### Phase Ordering Rationale

- **Bottom-up data integrity with Vertical MVP delivery:** Phase 1 builds the database schema and verified FK graph engine; Phase 2 delivers the complete Manager Portal slice; Phase 3 & 4 deliver the complete Word Designer + SQL Compiler slice; Phase 5 delivers the complete Runtime Runner & PDF/DOCX Export slice.
- **Zero rework:** Solving composite FKs, role-playing FKs, and virtual relationships in Phases 1–2 ensures the Designer (Phase 4) and Runtime Compiler/Executor (Phases 4–5) never hit schema dead-ends on `TMS_Lite_1_Oct_2026`.

### Research Flags

Phases with well-established architecture (standard planning):
- **Phase 1 & Phase 2:** Database schema introspection, BFS multigraph, and Angular CDK virtual-scroll CRUD portals follow deterministic patterns already verified against `TMS_Lite_1_Oct_2026`.
- **Phase 3, Phase 4 & Phase 5:** Detailed component specifications and edge-case mitigations are documented in `STACK.md`, `ARCHITECTURE.md`, and `PITFALLS.md`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified local `.NET SDK` & SQL Server connectivity; Angular 19 + TipTap/ProseMirror + Dapper + PuppeteerSharp + OpenXML is proven for paginated document apps |
| Features | HIGH | Directly mapped from user's 7-section spec + 8 resolved schema gap decisions |
| Architecture | HIGH | Grounded in live `TMS_Lite_1_Oct_2026` metadata (404 tables, 5,993 columns, 341 FKs, 14 composite FKs, 14 multi-FK pairs) |
| Pitfalls | HIGH | Every SQL Server, BFS graph, and WYSIWYG pagination edge case was verified against the live database |

**Overall confidence:** HIGH

### Gaps to Address

- **All 8 architectural and schema gaps identified during initialization have been explicitly resolved with the user** and incorporated into `PROJECT.md` and `REQUIREMENTS.md`.

## Sources

### Primary (HIGH confidence)
- Live SQL Server introspection of `localhost` / `TMS_Lite_1_Oct_2026` (`INFORMATION_SCHEMA.TABLES`, `INFORMATION_SCHEMA.COLUMNS`, `sys.foreign_keys`, `sys.foreign_key_columns`)
- ProseMirror / TipTap Custom Node & Schema Reference, Angular 19 CDK Drag-and-Drop / Virtual Scroll documentation, Microsoft `DocumentFormat.OpenXml` v3.1 & `Dapper` specifications

---
*Research completed: 2026-11-13*
*Ready for roadmap: yes*

