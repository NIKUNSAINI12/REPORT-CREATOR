# Dynamic Word-Like Report Designer & SQL Query Engine (TMS Report Designer)

## What This Is

A full-stack, MS Word-like WYSIWYG Report Designer, Data Dictionary Governance Portal, and Dynamic SQL Execution/Export Engine built with **Angular** and **ASP.NET Core (.NET) Web API**, connected to the local Microsoft SQL Server database `TMS_Lite_1_Oct_2026`. It empowers managers to govern and publish friendly aliases for database columns (plus virtual relationships for unlinked tables), allows end-users to design rich paginated document templates with drag-and-drop fields constrained by real-time Foreign Key graph reachability, and executes parameterized queries on a dedicated Report Runner page (or via direct URL document parameters) to render live previews, PDFs, and Word (`.docx`) exports.

## Core Value

Users can visually design MS Word-fidelity paginated report templates using governed database fields that automatically compile into safe, shortest-path `LEFT JOIN` T-SQL queries—and accurately generate merged single/batch PDF and DOCX documents on a dedicated execution page without writing a single line of SQL.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **DDL & Persistence Schema**: SQL DDL scripts and auto-migration for `Report_Field_Catalog`, `Report_Custom_Relationships` (virtual FKs for the 151 unlinked tables), and `Saved_Report_Templates` in `TMS_Lite_1_Oct_2026`.
- [ ] **Schema Introspection & FK Graph Service**: Introspect `INFORMATION_SCHEMA.TABLES` (404 tables), `INFORMATION_SCHEMA.COLUMNS` (5,993 columns), and `sys.foreign_keys` / `sys.foreign_key_columns` (341 physical FKs, including 14 composite FKs, 14 multi-FK pairs, and 5 self-referencing FKs) merged with `Report_Custom_Relationships`.
- [ ] **Cardinality-Aware BFS Reachability & Role Disambiguation**: Execute Breadth-First Search across the FK graph to lock unreachable sidebar fields in real time, prevent accidental `N -> 1 <- N` chasm/fan-trap joins through shared master lookup tables (e.g., `CL_Master_Location`), and prompt users on field drop when multiple FKs exist between the same tables (e.g., `CL_Thc_Header` -> `CL_Master_Location` Origin vs. Destination) so each role gets a distinct table alias.
- [ ] **Module 1 — Manager Data Dictionary Portal**: Searchable, virtualized portal for 404 tables / 5,993 columns with bulk publish/unpublish, auto-humanized aliases (`Consignment_No` -> `"Consignment No"`), category grouping, filterable toggles, custom virtual FK relationship builder, and instant real-time sync to the Designer sidebar.
- [ ] **Module 2A — Complete MS Word Ribbon & Paginated Canvas**: Multi-tab Ribbon UI (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) above a ruler-equipped, paginated WYSIWYG canvas supporting Clipboard/History, Format Painter, Find & Replace, Typography/Styles, Lists/Paragraphs, NxM Tables with contextual cell/border tools, Images (upload/URL/wrap/resize), Shapes/Callouts/Signature lines, Hyperlinks, Repeating Headers/Footers, System Tokens (`Page X of Y`, `Current Date/Time`, `Printed By`), Page/Section Breaks, Special Characters, Page Setup (A4/Letter/Legal/A3/A5/Custom, Portrait/Landscape, Margins, 1–3 Columns, Diagonal/Image Watermarks), and Zoom/Ruler/Gridline toggles.
- [ ] **Module 2B — Field Drag-and-Drop, Multiple Repeaters & Inline Formatting**: Support inline scalar merge tags (`{{TableName.DisplayName}}`), repeating data rows (`<tr data-repeater="true">`), multiple independent `1:N` repeating tables in a single document (preventing Cartesian product multiplication), table footer aggregations (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), and right-click field formatting (Date `DD-MM-YYYY`, Currency `₹ #,##0.00`, Case, Null default).
- [ ] **Module 2C — Runtime Filter Builder**: Configure runtime filters on any reachable published field with `FieldId`, `FilterLabel`, `Operator` (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`), auto-mapped `UIControlType` (including dynamic `SELECT DISTINCT TOP 500` lookup dropdowns for `varchar`), and `IsRequired`.
- [ ] **Module 3 — Template Persistence & Dynamic T-SQL Compiler**: Save `LayoutJson`, `QueryMetadataJson` (`SelectedFields` with role aliases, ordered `JoinPath` including intermediate bridge tables and composite FK conditions, `FilterConfig`), and bracket-quoted `CompiledSelectQuery` using `LEFT JOIN` and strict `@Param` binding (expanding `IN` and `BETWEEN` safely).
- [ ] **Module 4 — Separate Report Runner Page & Export Engine (Preview, PDF, DOCX)**: Dedicated Angular page (`/reports/run/:templateId`) supporting both interactive filter input and direct URL parameter execution (e.g., `/reports/run/5?Tripsheet_Id=1042&autoRun=true`), supporting Single/Batch Document Mode (grouped by Anchor PK with page breaks per record) and Summary List Mode, plus high-fidelity Browser Print Preview, PDF download, and Word (`.docx`) download.

### Out of Scope

- **Arbitrary raw SQL entry by end-users** — Defeats governance and introduces SQL injection / schema coupling risks; all queries are compiled from governed catalog fields.
- **Database write/mutation operations from reports** — Reports are strictly read-only analytical/document outputs (`SELECT` only).

## Context

- **Live Database Audited (`TMS_Lite_1_Oct_2026` on `localhost`)**:
  - `404` base tables and `5,993` columns.
  - `341` foreign key constraints covering `253` tables (`215` with outgoing FKs, `83` with incoming FKs).
  - `151` tables have no physical `sys.foreign_keys` constraints and require the **Virtual / Custom Relationships** table (`Report_Custom_Relationships`) to participate in joins.
  - `14` table pairs have multiple FKs between the exact same two tables (e.g., `CL_Thc_Header` has 4 FKs to `CL_Master_Location`; `CL_Tripsheet_Header` has 2 FKs to `CL_Master_Driver` and 2 to `CL_Master_Location`; `CL_Order_Header` has 2 FKs to `CL_Master_Address`).
  - `14` foreign keys are composite (multi-column joins) and `5` are self-referencing FKs.
- **Workflow Separation**:
  - Template creation and saving happen in the **Report Designer** (`/designer` or `/designer/:id`).
  - Report execution, data merging, and PDF/DOCX generation happen on a **separate Report Runner / Viewer page** (`/reports/run/:id`) or via backend export endpoints, allowing TMS transaction screens to generate documents for specific records on demand.

## Constraints

- **Tech Stack**: **Angular** (Frontend SPA) + **ASP.NET Core (.NET) Web API** (Backend) + **Microsoft SQL Server** (`TMS_Lite_1_Oct_2026`).
- **Database Connection**: `Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;` stored in `appsettings.json` / environment configuration.
- **Security**: Zero SQL injection risk — all table/column identifiers must be validated against schema metadata and bracket-quoted (`[dbo].[Table].[Col]`), and all runtime filter values must bind via `SqlParameter` (`@Param0`, `@Param1`).
- **Performance**: Manager Portal must smoothly handle 404 tables and ~6,000 columns via virtual scrolling / server-side filtering and lazy table inspection.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| **Angular + ASP.NET Core Web API** | Matches enterprise TMS stack and user preference; strong SQL Server & OpenXML/PDF ecosystem in .NET | — Pending |
| **Role-Playing FK Prompt on Drop** | `TMS_Lite_1_Oct_2026` has 14 multi-FK pairs (e.g., 4 FKs from `CL_Thc_Header` to `CL_Master_Location`); prompting on drop allows choosing Origin vs. Destination and aliasing each separately | — Pending |
| **Custom Virtual Relationships + Chasm-Trap Prevention** | 151 tables lack physical FKs; shared master tables (`CL_Master_Location`) would otherwise cause `N -> 1 <- N` Cartesian fan-outs in undirected BFS | — Pending |
| **Independent Child Repeater Queries / Deduplication** | Prevents `1:N` × `1:M` Cartesian multiplication when a document contains multiple repeating detail tables (e.g., Packages + Advances) | — Pending |
| **Single/Batch Document Mode (Anchor PK Grouping) + Footer Aggregates** | Operational TMS documents (Consignments, Tripsheets, Invoices) need per-document page breaks when run in batch plus `SUM/COUNT/AVG` footer totals | — Pending |
| **Dedicated Report Runner Page + Direct URL Param Execution** | Enables both interactive ad-hoc reporting and 1-click document PDF/DOCX generation from other TMS screens | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-13 after initialization and extensive schema gap analysis*

