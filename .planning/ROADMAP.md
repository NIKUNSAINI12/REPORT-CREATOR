# Roadmap: Dynamic Word-Like Report Designer & SQL Query Engine

## Overview

This roadmap delivers the **Dynamic Word-Like Report Designer & SQL Query Engine** across five vertical MVP phases grounded in the live `TMS_Lite_1_Oct_2026` SQL Server schema (`404` tables, `5,993` columns, `341` physical FKs). We start with the SQL Server persistence DDL, Schema Introspection, and Cardinality-Aware Foreign Key Multigraph Service (`Phase 1`), then deliver the Manager Data Dictionary & Virtual Relationship Portal (`Phase 2`), the Complete MS Word Ribbon & Paginated Document Canvas (`Phase 3`), the FK-Locked Field Drag-and-Drop, Role Disambiguation, Filter Builder & Dynamic T-SQL Compiler (`Phase 4`), and finally the Separate Report Runner Page, Multi-Repeater Merge Engine & Print/PDF/DOCX Export (`Phase 5`).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Database Foundation, Schema Introspection & FK Multigraph Engine** - Solution scaffolding, DDL auto-migration (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`), and Cardinality-Aware BFS Multigraph API over `TMS_Lite_1_Oct_2026`.
- [ ] **Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Portal** - Searchable, virtual-scrolled Angular portal for 404 tables / 5,993 columns with bulk publish, auto-humanized aliases, custom virtual FK relationships, and instant cache sync.
- [ ] **Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Document Canvas** - Multi-tab MS Word Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) and paginated, ruler-equipped WYSIWYG canvas with headers/footers, watermarks, tables, and styles.
- [ ] **Phase 4: Module 2B/2C & Module 3 — Field Binding, FK Locking, Filter Builder & Dynamic T-SQL Compiler** - Real-time BFS sidebar locking, Role-Playing FK disambiguation prompt on drop, Scalar & Repeater Row binding, Footer Aggregates, Filter Builder, and parameterized `LEFT JOIN` SQL Compiler.
- [ ] **Phase 5: Module 4 — Separate Report Runner Page, Multi-Repeater Merge & Print/PDF/DOCX Export** - Dedicated `/reports/run/:templateId` execution page (interactive filters + direct URL query-param execution), Single/Batch Document Mode merge engine, and Print, PDF, and `.docx` export.

## Phase Details

### Phase 1: Database Foundation, Schema Introspection & FK Multigraph Engine

**Goal**: Establish the `.NET 8 Web API` + `Angular 19` workspace, provision the catalog/relationship/template tables in `TMS_Lite_1_Oct_2026`, introspect all 404 tables / 5,993 columns / 341 FKs, and expose a Cardinality-Aware BFS Multigraph Reachability API.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04]
**Success Criteria** (what must be TRUE):
  1. SQL DDL script creates `Report_Field_Catalog`, `Report_Custom_Relationships`, and `Saved_Report_Templates` idempotently in `TMS_Lite_1_Oct_2026`.
  2. Schema Introspection API returns all 404 tables and 5,993 columns from `TMS_Lite_1_Oct_2026` in under 200ms with data types and nullability.
  3. FK Multigraph Service accurately models single-column FKs, all 14 composite FKs, 5 self-referencing FKs, 14 same-table multi-FK pairs (e.g., `CL_Thc_Header` -> `CL_Master_Location` 4 FKs), and custom virtual FKs.
  4. BFS Reachability endpoint returns reachable tables and shortest `LEFT JOIN` paths from any set of active canvas tables while blocking `N -> 1 <- N` chasm/fan-trap joins through shared master lookup tables.

**Plans**: 3 plans

Plans:
**Wave 1**
- [ ] 01-01: Scaffold `.NET 8 Web API` + `Angular 19` workspace and execute SQL DDL migration for `Report_Field_Catalog`, `Report_Custom_Relationships`, and `Saved_Report_Templates`

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 01-02: Build Schema Introspection Service (`INFORMATION_SCHEMA` + `sys.foreign_keys`) and In-Memory Labeled FK Multigraph (supporting composite, self-ref, multi-FK role pairs, and virtual FKs)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 01-03: Build Cardinality-Aware BFS Reachability & Shortest-Path Join Resolver Service + REST API endpoints and verification tests against `TMS_Lite_1_Oct_2026`

### Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Portal

**Goal**: Enable managers to search, govern, bulk-publish, and alias columns across all 404 tables / 5,993 columns and define custom virtual foreign keys for the 151 unlinked tables with instant real-time sync.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 1
**Requirements**: [MGR-01, MGR-02, MGR-03, MGR-04, MGR-05]
**Success Criteria** (what must be TRUE):
  1. Manager Portal (`/manager`) smoothly renders and searches across all 404 tables and 5,993 columns using virtual scrolling and lazy table expansion with zero UI freeze.
  2. Manager can toggle `IsActive` (Published), edit `DisplayName` (Alias), assign `Category`, and toggle `IsFilterable` individually or via **Bulk Publish** and **Auto-Humanize Aliases** (`Consignment_No` -> `"Consignment No"`).
  3. Manager can add/remove Virtual Foreign Key relationships (`ParentTable.Col <-> ReferencedTable.Col`) in `Report_Custom_Relationships` to connect any of the 151 unlinked tables.
  4. Any change in the Manager Portal immediately updates the backend graph/catalog cache and reflects in the Designer sidebar API without restarting the server.

**Plans**: 3 plans

Plans:
- [ ] 02-01: Build `.NET` Data Dictionary Catalog CRUD, Bulk Publish, Auto-Humanize, and Custom Virtual Relationship APIs with instant graph cache invalidation
- [ ] 02-02: Build Angular Manager Data Dictionary Portal UI with CDK virtual scrolling, instant search, table group accordion, inline alias editing, and bulk actions
- [ ] 02-03: Build Angular Virtual Relationship Builder UI in Manager Portal with column compatibility validation and live reachability preview

### Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Document Canvas

**Goal**: Deliver a complete MS Word multi-tab Ribbon UI (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) above a paginated, ruler-equipped WYSIWYG canvas supporting full document formatting, contextual tables, repeating headers/footers, watermarks, and page setup.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 2
**Requirements**: [WORD-01, WORD-02, WORD-03, WORD-04, WORD-05, WORD-06, WORD-07, WORD-08]
**Success Criteria** (what must be TRUE):
  1. User can format text and paragraphs via the `Home` tab (Undo/Redo, Cut/Copy/Paste, Format Painter, Find & Replace, Font Family/Size, Bold/Italic/Underline variants/Strike/Sub/Sup, Change Case, Colors, Clear Formatting, Heading Styles, Alignment, Bulleted/Numbered/Nested Lists, Indentation, Line Spacing, Borders/Shading).
  2. User can insert and configure elements via the `Insert` tab (`NxM` Tables, Images with upload/URL/wrap/aspect-ratio resize, Shapes/Callouts/Signature lines, Hyperlinks, Repeating Headers & Footers, System Tokens `Page X of Y` / Date / Time / Printed By, Page/Section Breaks, Special Characters `₹`, `$`, `€`).
  3. When cursor is inside a table, contextual `Table Design & Layout` tools appear allowing row/column insert/delete, cell merge/split, cell shading/padding/vertical alignment/custom borders, **Header Row Repeat** toggle, and **Repeating Data Row** toggle.
  4. User can configure `Layout` (A4/Letter/Legal/A3/A5/Custom sizes, Portrait/Landscape, Margins, 1–3 Columns, Diagonal/Image Watermarks) and `View` aids (Zoom 50%–200%, Fit to Page/Width, Horizontal & Vertical Rulers with indent markers, Table Gridlines toggle).

**Plans**: 4 plans

Plans:
- [ ] 03-01: Build Paginated Sheet Canvas, Horizontal/Vertical Rulers, Watermark Layer, Repeating Header/Footer Zones, and Page Setup state model (`Layout` & `View` tabs)
- [ ] 03-02: Build MS Word Ribbon `Home` Tab (Clipboard, History, Format Painter, Find & Replace, Typography, Change Case, Quick Styles, Lists, Indentation, Spacing, Paragraph Borders/Shading)
- [ ] 03-03: Build MS Word Ribbon `Insert` Tab (Interactive Table Grid, Image Upload/URL/Resize/Wrap, Callout Boxes, Signature Lines, Hyperlinks, System Tokens, Page/Section Breaks, Special Characters)
- [ ] 03-04: Build Contextual `Table Design & Layout` Ribbon Tab (Row/Col operations, Merge/Split cells, Cell Shading/Alignment/Padding/Borders, Header Row Repeat & Data Repeater Row toggles)

### Phase 4: Module 2B/2C & Module 3 — Field Binding, FK Locking, Filter Builder & Dynamic T-SQL Compiler

**Goal**: Connect the Word Designer to the governed catalog and FK BFS graph so users can drag-and-drop scalar and repeating fields with real-time FK reachability locking, disambiguate multi-FK roles, configure runtime filters, and save templates with compiled parameterized T-SQL.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 3
**Requirements**: [BIND-01, BIND-02, BIND-03, BIND-04, BIND-05, BIND-06]
**Success Criteria** (what must be TRUE):
  1. Sidebar starts unlocked at zero fields; dropping the first field sets the Anchor Table, and every drop/deletion triggers BFS reachability to grey out and lock unreachable fields with tooltip `"Cannot add: No Foreign Key relationship with selected tables"`; removing all fields unlocks all sidebar fields.
  2. Dropping a field from a table with multiple FK paths (e.g., `CL_Thc_Header` -> `CL_Master_Location` Origin vs. Destination) prompts the user to pick the relationship role and assigns a distinct SQL table alias so multiple roles of the same master table can coexist on one report.
  3. Users can drop Inline Scalar Merge Tags (`{{Table.DisplayName}}`), bind Repeating Table Rows (`<tr data-repeater="true">`), add Table Footer Aggregates (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), and right-click pills to set Date (`DD-MM-YYYY`), Currency (`₹ #,##0.00`), Case, and Null default formats.
  4. Users can configure Runtime Filters (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`) with auto-mapped UI controls and save the template to `Saved_Report_Templates` with `LayoutJson`, `QueryMetadataJson`, and bracket-quoted `CompiledSelectQuery` (`LEFT JOIN` including intermediate bridge tables and composite FK predicates).

**Plans**: 3 plans

Plans:
- [ ] 04-01: Build Designer Governed Field Sidebar with real-time BFS reachability locking, Role-Playing FK Disambiguation modal on drop, and CDK Drag-and-Drop onto ProseMirror/TipTap canvas
- [ ] 04-02: Build Custom `MergeTag` Pill Node, Right-Click Field Formatting Popover (Date, `₹` Currency, Case, Null Default, Footer Aggregates `SUM/COUNT/AVG/MIN/MAX`), and Runtime Filter Builder UI
- [ ] 04-03: Build `.NET` Dynamic T-SQL Compiler (Ordered `LEFT JOIN` path with bridge tables, composite FKs, role aliases, `WHERE 1=1 /*DYNAMIC_FILTERS*/`) and `Saved_Report_Templates` Persistence API

### Phase 5: Module 4 — Separate Report Runner Page, Multi-Repeater Merge & Print/PDF/DOCX Export

**Goal**: Deliver the dedicated Report Generator / Viewer page (`/reports/run/:templateId`) and backend execution/export engine supporting interactive filters, direct URL query-parameter execution, multi-repeater Cartesian-free merging, Single/Batch Document Mode, and Print/PDF/DOCX export.
**Mode:** mvp
**UI hint**: yes
**Depends on**: Phase 4
**Requirements**: [EXEC-01, EXEC-02, EXEC-03, EXEC-04]
**Success Criteria** (what must be TRUE):
  1. End-user can open `/reports/run/:templateId` to use the Dynamic Filter Panel (with `SELECT DISTINCT TOP 500` dropdown lookups) OR invoke `/reports/run/:templateId?Field=Value&autoRun=true` from any TMS screen to immediately generate the report for a specific document/record.
  2. Backend binds all filter inputs via parameterized `SqlParameter` (`@Param0`, `@Param1`, safely expanding `IN` and `BETWEEN` with zero SQL injection risk) and executes/deduplicates multiple `1:N` repeating tables independently per parent record to prevent Cartesian multiplication.
  3. Merge Engine renders both **Single/Batch Document Mode** (grouping by Anchor PK with page breaks per parent record) and **Summary List Mode**, replacing scalar tags, expanding repeating `<tr>` rows, computing footer aggregates, formatting dates/numbers, and updating `Page X of Y`.
  4. User can execute **Browser Print Preview**, **Download as PDF**, and **Download as Word (`.docx`)** preserving page size, orientation, margins, headers/footers, watermarks, tables, and styles.

**Plans**: 3 plans

Plans:
- [ ] 05-01: Build `.NET` Parameterized Query Execution Engine (`IN`/`BETWEEN` expansion, `SELECT DISTINCT TOP 500` filter lookup API, and split/deduplicated `1:N` multi-repeater query execution)
- [ ] 05-02: Build Master-Detail Document Merge Engine (Single/Batch Document Mode grouped by Anchor PK + Summary List Mode + Footer Aggregates) and Dedicated Angular Report Runner Page (`/reports/run/:templateId` with URL query-param auto-run + Designer Live Preview)
- [ ] 05-03: Build High-Fidelity Print Preview, Server-Side PDF Exporter (`PuppeteerSharp` / paged CSS), and Native Word (`.docx`) Exporter (`DocumentFormat.OpenXml`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation, Schema Introspection & FK Multigraph Engine | 0/3 | Not started | - |
| 2. Module 1 — Manager Data Dictionary & Virtual Relationship Portal | 0/3 | Not started | - |
| 3. Module 2A — Complete MS Word Ribbon & Paginated Document Canvas | 0/4 | Not started | - |
| 4. Module 2B/2C & Module 3 — Field Binding, FK Locking, Filter Builder & Dynamic T-SQL Compiler | 0/3 | Not started | - |
| 5. Module 4 — Separate Report Runner Page, Multi-Repeater Merge & Print/PDF/DOCX Export | 0/3 | Not started | - |
