# Feature Research

**Domain:** Dynamic Word-Like WYSIWYG Report Designer, Data Dictionary Governance Portal & Graph-Driven T-SQL Query/Export Engine (Enterprise TMS)
**Researched:** 2026-11-13
**Confidence:** HIGH (Grounded directly in live `TMS_Lite_1_Oct_2026` SQL Server schema audit: 404 tables, 5,993 columns, 341 physical FKs, 151 unlinked tables, 14 multi-FK pairs, 14 composite FKs, 5 self-referencing FKs)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users and administrators assume exist in an enterprise MS Word-like Report Designer and Data Dictionary system. Missing any of these makes the product feel incomplete or unusable for operational TMS reporting.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **1. Manager Data Dictionary Portal** | Administrators must curate which of the `404` tables and `5,993` columns in `TMS_Lite_1_Oct_2026` are visible to report authors, assign business-friendly display names, and organize fields into logical categories. | MEDIUM | Requires virtual scrolling / server-side filtering to handle ~6,000 columns without UI lag. Persists to `Report_Field_Catalog` (`FieldId`, `TableName`, `ColumnName`, `DisplayName`, `DataType`, `CategoryName`, `IsPublished`, `IsFilterable`) and syncs in real time to the Designer sidebar. |
| **2. Complete MS Word Ribbon & Paginated Canvas** | Business users designing Consignment Notes, Tripsheets, Manifests, and Freight Invoices expect familiar Microsoft Word formatting ergonomics and true print-page boundaries (`A4`, `Letter`, `Legal`, `A3`, `A5`, Custom, Portrait/Landscape). | HIGH | Multi-tab Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) above a ruler-equipped paginated canvas. Includes Clipboard/Undo/Redo, Format Painter, Find & Replace, Typography/Styles, Lists/Paragraphs, `NxM` Tables with cell merge/split/borders/shading, Images (upload/URL/wrap/resize), Shapes/Callouts/Signature lines, Hyperlinks, Repeating Headers/Footers, System Tokens (`Page X of Y`, `Current Date/Time`, `Printed By`), Page/Section Breaks, Special Characters, Margins, 1–3 Columns, Diagonal/Image Watermarks, and Zoom/Ruler/Gridline toggles. |
| **3. Inline Scalar & Repeating Table Row Binding** | Operational TMS templates combine document-level header fields (e.g., Tripsheet No, Vehicle No) with repeating line-item tables (e.g., Consignments, Packages, Charges) and require localized value formatting. | MEDIUM | Dragging a field into body text/headers/static cells inserts a styled non-editable merge pill (`{{TableName.DisplayName}}`). Dragging into a table body row marks `<tr data-repeater="true">` to clone dynamically per child record. Right-click context menu configures inline formatting: Date (`DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD HH:mm`), Number/Currency (`₹ #,##0.00`, `#,##0`), Text Case (`UPPER`, `lower`, `Title`), and Null Fallback (`-`, `0.00`, `N/A`). |
| **4. Foreign Key BFS Reachability & Real-Time Sidebar Locking** | Non-technical users do not know database join rules; once an anchor table is chosen, the UI must prevent them from dropping fields from tables that cannot be validly joined. | HIGH | Introspects `INFORMATION_SCHEMA` and `sys.foreign_keys` (`341` physical FKs, including `14` composite FKs and `5` self-referencing FKs). Dropping the first field locks the **Anchor Table**; an instant Breadth-First Search (BFS) across the FK graph marks reachable tables active and grays out/locks unreachable tables (`cursor: not-allowed` with explanatory tooltip). Removing all fields resets the anchor. |
| **5. Runtime Filter Builder** | Saved report templates need interactive parameter prompts (e.g., Date Range, Branch, Customer, Tripsheet No) so end-users can filter data at execution time without editing the template. | MEDIUM | Configures filter rules on any reachable published field (`IsFilterable = 1`): `FieldId`, `FilterLabel`, `Operator` (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`), auto-mapped `UIControlType` (`date` -> Datepicker, `int`/`decimal` -> Number input, `bit` -> Checkbox, `varchar` -> Text / Multi-select Lookup dropdown populated via `SELECT DISTINCT TOP 500`), and `IsRequired`. |
| **6. JSON Template Persistence & Parameterized `LEFT JOIN` SQL Compiler** | Templates must be reloadable for future editing and must compile deterministic, injection-safe T-SQL queries that preserve parent records even when optional child/lookup records are `NULL`. | HIGH | Saves to `Saved_Report_Templates`: `LayoutJson` (full paginated DOM/styles), `QueryMetadataJson` (`SelectedFields`, ordered `JoinPath` including intermediate bridge tables and multi-column composite FK conditions, `FilterConfig`), and `CompiledSelectQuery`. Uses `LEFT JOIN` exclusively, bracket-quotes all schema-validated identifiers (`[dbo].[Table].[Col]`), and binds runtime values strictly via `@Param0`, `@Param1` (`SqlParameter`), safely expanding `IN (@Param0_0, ...)` and `BETWEEN @Param0_Start AND @Param0_End`. |
| **7. Separate Report Runner Page & Preview/PDF/DOCX Export** | Designing a template and running/printing operational documents are separate roles and workflows; users need a dedicated execution screen plus high-fidelity PDF and Word outputs. | HIGH | Dedicated Angular route (`/reports/run/:templateId`) that loads `QueryMetadataJson` + `FilterConfig`, renders the filter form, executes the parameterized query, merges data into `LayoutJson`, and provides live Paginated Browser Print Preview, exact-pagination PDF export, and editable Microsoft Word (`.docx` OpenXML) download. |

---

### Differentiators (Competitive Advantage)

Features specifically engineered around the real-world schema topology of `TMS_Lite_1_Oct_2026` and enterprise TMS document workflows. These separate this platform from generic BI/reporting tools that fail on complex logistics schemas.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **1. Role-Playing FK Disambiguation Prompt on Drop** | `TMS_Lite_1_Oct_2026` contains **14 table pairs with multiple FKs between the exact same two tables** (e.g., `CL_Thc_Header` has 4 FKs to `CL_Master_Location`; `CL_Tripsheet_Header` has 2 FKs to `CL_Master_Driver` and 2 to `CL_Master_Location`; `CL_Order_Header` has 2 FKs to `CL_Master_Address`). Without disambiguation, dropping "Location Name" is ambiguous and generates broken SQL. | HIGH | When a user drops a field from a target table reachable via multiple FK constraints from the active graph, a lightweight popover prompts them to choose the business role (e.g., *"Origin Location (`FromLocationId`)"* vs. *"Destination Location (`ToLocationId`)"*). The SQL compiler assigns a distinct table alias per role (`LEFT JOIN [dbo].[CL_Master_Location] AS [CL_Master_Location_Origin] ON ...`) and badges the merge pill (`{{Origin Location.Location Name}}`). |
| **2. Virtual / Custom Relationships for the 151 Unlinked Tables** | Exactly **151 of the 404 tables** in `TMS_Lite_1_Oct_2026` lack physical `sys.foreign_keys` constraints in SQL Server. Relying solely on physical FKs would permanently lock 37% of the database out of the Report Designer. | MEDIUM | Provides `Report_Custom_Relationships` (`RelationshipId`, `SourceTable`, `SourceColumn`, `TargetTable`, `TargetColumn`, `RelationshipAlias`, `Cardinality`, `IsActive`) managed in the Manager Data Dictionary Portal. The backend FK Graph Service merges physical `sys.foreign_keys` with active custom relationships into a single unified adjacency list before running BFS reachability. |
| **3. Chasm / Fan-Trap (`N -> 1 <- N`) Prevention** | Shared master lookup tables in `TMS_Lite_1_Oct_2026` (such as `CL_Master_Location`, `CL_Master_Vehicle`, `CL_Master_Customer`) are referenced by dozens of unrelated transaction tables. Naive undirected BFS would traverse `Tripsheet (N) -> Location (1) <- Invoice (N)`, creating massive Cartesian fan-traps across unrelated transactions. | HIGH | Enforces **Cardinality-Aware Graph Traversal**: once a path steps from a detail/transaction table into a parent/master lookup table (`N -> 1`), the BFS algorithm prohibits stepping back out into a *different* `1 -> N` child branch unless explicitly anchored or linked along a valid parent-to-child hierarchy. Protects non-technical users from accidental million-row cross-joins. |
| **4. Independent Multi-Repeater Table Queries** | Operational TMS documents frequently require **two or more independent `1:N` repeating tables** in the same document (e.g., a Tripsheet template with a *Consignments* table, a *Driver Advances* table, and a *Route Checkpoints* table). Joining all three in one flat `SELECT` multiplies rows (`N × M × K`). | HIGH | Each `<tr data-repeater="true">` table is bound to its own child table context. At execution time, the engine either runs separate parameterized child queries keyed by the Anchor Table Primary Key(s) or groups/deduplicates child collections in memory per parent PK before merging into each repeater's DOM rows. |
| **5. Single / Batch Document Mode Grouped by Anchor PK + Table Footer Aggregates** | Logistics teams print either a single Consignment/Invoice or a batch of 50 Invoices at once (requiring each document to start on a fresh page with its own header/detail rows and `SUM` totals), as well as tabular summary registers. | HIGH | Supports **Document Mode (Single/Batch)**—grouping datasets by the Anchor Table PK, rendering one complete multi-page document per parent entity with automatic page breaks between records—and **Summary List Mode**. Includes one-click **Table Footer Aggregations** (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`) evaluated per parent document in Document Mode or across the dataset in Summary Mode. |
| **6. Direct URL Query-Param Execution for TMS Screens** | Operational TMS screens (e.g., Tripsheet View, Consignment Booking, Billing Portal) need a 1-click *"Print PDF / Download Word"* action without forcing the operator to manually re-type the document ID in a filter form. | LOW | The Report Runner route (`/reports/run/:templateId?Tripsheet_Id=1042&autoRun=true`) and export API endpoints accept URL query parameters matching template filter fields, automatically binding `@Param` values and rendering/downloading the merged document immediately. |
| **7. Auto-Humanized Column Aliases + Bulk Publish Governance** | Manually typing friendly names for `5,993` raw SQL columns (`Consignment_No`, `Total_Freight_Amt`, `Veh_Reg_No`) is tedious and slows initial onboarding. | LOW | Includes an algorithmic **Auto-Humanize** utility in the Manager Portal that strips technical prefixes (`CL_`, `Master_`, `Hdr_`), splits underscores/camelCase, and title-cases abbreviations (`Consignment_No` -> `"Consignment No"`), paired with one-click Table-level and Category-level **Bulk Publish / Unpublish**. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that are tempting to add in reporting tools but introduce severe security vulnerabilities, data corruption risks, or Cartesian query failures.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **1. Raw End-User SQL Editing** | Power users sometimes ask for a "Custom SQL" textbox in the Report Designer to tweak the generated query or write ad-hoc SQL. | Bypasses the Manager Data Dictionary governance layer, exposes sensitive/unpublished columns, breaks when schema changes occur, and opens critical SQL injection and denial-of-service vectors. | Keep `CompiledSelectQuery` strictly system-generated and read-only in a diagnostic preview drawer; empower managers to add missing join paths via **Virtual / Custom Relationships** (`Report_Custom_Relationships`). |
| **2. Database Mutations / Write Operations from Reports** | Users occasionally ask to update a status flag (e.g., `SET IsPrinted = 1`) or edit a field directly inside a generated report preview. | Violates read-only reporting isolation, risks accidental mass updates during batch runs, and complicates transaction management and audit logging. | Enforce strict read-only query compilation (`SELECT` only, validated against catalog metadata, executed under a read-only command pipeline). Handle print-audit logging via dedicated application telemetry if needed. |
| **3. Unparameterized String Concatenation for SQL Filters & Identifiers** | Concatenating filter values directly into the SQL `WHERE` clause (e.g., `"WHERE TripsheetNo = '" + input + "'"`) seems simpler when building dynamic queries or `IN (...)` lists. | Creates immediate SQL injection vulnerabilities, breaks on apostrophes/dates/locales, and thwarts SQL Server execution plan caching. | Validate all table/column names against `INFORMATION_SCHEMA` + `Report_Field_Catalog`, bracket-quote every identifier (`[dbo].[Table].[Col]`), and bind every runtime value via `SqlParameter` (`@Param0`, `@Param1`), expanding `IN` clauses into parameterized lists (`@Param0_0, @Param0_1`). |
| **4. Unrestricted Undirected BFS Joins Across Shared Lookups** | Treating the entire FK graph as a flat undirected network where any two tables connected by *any* path can be joined. | In `TMS_Lite_1_Oct_2026`, `CL_Master_Location` connects to dozens of tables; undirected BFS would join `CL_Tripsheet_Header` to `CL_Customer_Invoice` via `CL_Master_Location`, producing nonsensical `N -> 1 <- N` chasm traps and server timeouts. | Use **Cardinality-Aware BFS** that tracks edge direction (`N -> 1` vs `1 -> N`) and blocks `N -> 1 <- N` fan-outs through shared lookup tables. |
| **5. Single Flat SQL Join for Multiple `1:N` Child Repeaters** | Compiling a single `SELECT` statement that `LEFT JOIN`s the Anchor Table to two or more `1:N` child tables at once. | If a Consignment has 10 Packages and 4 Charge lines, a single flat join produces `40` rows with duplicated package and charge amounts, corrupting both the repeating tables and `SUM()` footer totals. | Execute **Independent Multi-Repeater Child Queries** (or split/deduplicate datasets by child PK) so each repeating table in the document renders its exact `1:N` rows and accurate footer aggregates. |

---

## Feature Dependencies

```
[SQL DDL & Schema Introspection Service]
    ├──requires──> [Manager Data Dictionary Portal]
    │                  ├──enables──> [Auto-Humanized Column Aliases + Bulk Publish]
    │                  └──enables──> [Virtual / Custom Relationships (151 Unlinked Tables)]
    │
    └──requires──> [Unified FK Graph & Cardinality-Aware BFS Engine]
                       ├──requires──> [Virtual / Custom Relationships (151 Unlinked Tables)]
                       ├──enables──> [Real-Time Sidebar Locking & Chasm-Trap Prevention]
                       └──enables──> [Role-Playing FK Disambiguation Prompt on Drop]

[Complete MS Word Ribbon & Paginated Canvas]
    └──enables──> [Inline Scalar & Repeating Table Row Binding]
                      ├──requires──> [Real-Time Sidebar Locking & Chasm-Trap Prevention]
                      ├──requires──> [Role-Playing FK Disambiguation Prompt on Drop]
                      └──enables──> [Table Footer Aggregates (SUM/COUNT/AVG/MIN/MAX)]

[Runtime Filter Builder]
    └──requires──> [Manager Data Dictionary Portal]
    └──requires──> [Real-Time Sidebar Locking & Chasm-Trap Prevention]

[JSON Template Persistence & Parameterized LEFT JOIN SQL Compiler]
    ├──requires──> [Inline Scalar & Repeating Table Row Binding]
    ├──requires──> [Runtime Filter Builder]
    └──enables──> [Independent Multi-Repeater Table Queries]

[Separate Report Runner Page & Preview/PDF/DOCX Export]
    ├──requires──> [JSON Template Persistence & Parameterized LEFT JOIN SQL Compiler]
    ├──requires──> [Independent Multi-Repeater Table Queries]
    ├──enables──> [Single / Batch Document Mode Grouped by Anchor PK]
    └──enables──> [Direct URL Query-Param Execution for TMS Screens]

[Raw End-User SQL Editing] ──conflicts──> [Parameterized LEFT JOIN SQL Compiler & Catalog Governance]
```

### Dependency Notes

- **[Unified FK Graph & Cardinality-Aware BFS Engine] requires [Virtual / Custom Relationships]:** Because `151` tables in `TMS_Lite_1_Oct_2026` have no physical `sys.foreign_keys`, the BFS reachability engine must merge `Report_Custom_Relationships` with `sys.foreign_keys` before computing reachable tables in the Designer sidebar.
- **[Inline Scalar & Repeating Table Row Binding] requires [Role-Playing FK Disambiguation Prompt on Drop]:** When a user drops a field from one of the `14` multi-FK table pairs (e.g., `CL_Thc_Header` -> `CL_Master_Location`), the drop handler must capture the chosen FK constraint/role immediately so both the merge pill token and `QueryMetadataJson` store the disambiguated alias.
- **[Separate Report Runner Page & Export Engine] requires [Independent Multi-Repeater Table Queries] and [Single / Batch Document Mode]:** Accurate rendering of multi-table operational documents (Tripsheets, Consignments, Invoices) in Preview, PDF, and DOCX depends on grouping parent records by Anchor PK and resolving each repeating table without Cartesian duplication.
- **[Raw End-User SQL Editing] conflicts with [Parameterized LEFT JOIN SQL Compiler & Catalog Governance]:** Allowing arbitrary SQL strings breaks the structured `QueryMetadataJson` AST needed for multi-repeater child query splitting, role-alias mapping, and strict `SqlParameter` binding.

---

## MVP Definition

### Launch With (v1 — Full End-to-End Operational Release)

Because this system replaces manual report coding for `TMS_Lite_1_Oct_2026`, all four core architectural modules and the schema-specific safeguards are required for v1 launch:

- [ ] **Database DDL & Schema Introspection (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`)** — Required to catalog the 404 tables / 5,993 columns and 341 physical FKs.
- [ ] **Manager Data Dictionary Portal with Auto-Humanize, Bulk Publish & Virtual FK Builder** — Essential so managers can publish columns and link any of the 151 unlinked tables without DBA intervention.
- [ ] **Cardinality-Aware BFS Reachability Engine & Role-Playing FK Disambiguation** — Essential to prevent `N -> 1 <- N` chasm traps and resolve the 14 multi-FK table pairs (e.g., Origin vs. Destination location).
- [ ] **Complete MS Word Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`) & Paginated Canvas** — Required for Word-fidelity document authoring (tables, images, watermarks, headers/footers, system tokens, page setup).
- [ ] **Inline Scalar Merge Pills, Multi-Repeater Tables, Right-Click Formatting & Footer Aggregates (`SUM/COUNT/AVG/MIN/MAX`)** — Core data-binding mechanics for operational TMS documents.
- [ ] **Runtime Filter Builder with Dynamic Lookup Dropdowns (`SELECT DISTINCT TOP 500`)** — Needed for interactive report filtering.
- [ ] **JSON Template Persistence & Parameterized `LEFT JOIN` SQL Compiler (Composite FK & Multi-Repeater Aware)** — Compiles safe, bracket-quoted, `@Param`-bound T-SQL queries.
- [ ] **Dedicated Report Runner Page (`/reports/run/:templateId`), Direct URL Param Execution, Single/Batch Document Mode & Preview/PDF/DOCX Export** — Completes the end-to-end execution and document generation workflow.

### Add After Validation (v1.x)

Features to layer on once core operational templates (Consignments, Tripsheets, Invoices) are live in production:

- [ ] **Template Version History & Rollback** — Track revisions of `LayoutJson` and `QueryMetadataJson` when business users modify existing report layouts.
- [ ] **Calculated / Expression Fields in Designer** — Allow safe arithmetic expressions between two bound fields (e.g., `{{Freight_Amt}} - {{Advance_Amt}}`) without custom SQL.
- [ ] **Conditional Row / Section Visibility Rules** — Hide a signature block or discount row if a bound scalar value is `0` or `NULL`.

### Future Consideration (v2+)

Features to defer until broad adoption across TMS modules:

- [ ] **Scheduled Email / WhatsApp Batch Report Delivery** — Cron-triggered execution of saved templates emailed as PDF attachments to customers or branch managers.
- [ ] **Barcode & QR Code Dynamic Merge Elements** — Render Consignment No or E-Waybill No inline as scannable 1D/2D barcodes inside the paginated canvas.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| **Manager Data Dictionary Portal + Auto-Humanize + Bulk Publish** | HIGH | MEDIUM | **P1** |
| **Virtual / Custom Relationships (`151` Unlinked Tables)** | HIGH | MEDIUM | **P1** |
| **Cardinality-Aware BFS Reachability & Chasm-Trap (`N->1<-N`) Prevention** | HIGH | HIGH | **P1** |
| **Role-Playing FK Disambiguation Prompt on Drop (`14` Multi-FK Pairs)** | HIGH | MEDIUM | **P1** |
| **Complete MS Word Ribbon & Paginated WYSIWYG Canvas** | HIGH | HIGH | **P1** |
| **Inline Scalar Pills, Multi-Repeater Tables, Formatting & Footer Aggregates** | HIGH | HIGH | **P1** |
| **Runtime Filter Builder + Dynamic `DISTINCT TOP 500` Lookups** | HIGH | MEDIUM | **P1** |
| **Template Persistence & Parameterized `LEFT JOIN` T-SQL Compiler** | HIGH | HIGH | **P1** |
| **Separate Report Runner Page, Single/Batch Mode & Direct URL Execution** | HIGH | HIGH | **P1** |
| **High-Fidelity Browser Print Preview, PDF & Word (`.docx`) Export** | HIGH | HIGH | **P1** |
| **Template Version History & Conditional Section Visibility** | MEDIUM | MEDIUM | **P2** |
| **Dynamic Barcode / QR Code Elements & Scheduled Delivery** | MEDIUM | MEDIUM | **P3** |

**Priority key:**
- **P1:** Must have for v1 launch (core architecture + `TMS_Lite_1_Oct_2026` schema requirements)
- **P2:** Should have, add in v1.x after initial production templates are validated
- **P3:** Nice to have, future v2+ expansion

---

## Competitor / Alternative Approach Analysis

| Capability | Traditional RDLC / Crystal Reports | Generic BI Tools (PowerBI / Metabase) | Our TMS Report Designer Approach |
|------------|------------------------------------|---------------------------------------|----------------------------------|
| **Authoring UX** | Developer-centric IDE (Visual Studio); requires knowing datasets and SQL joins upfront | Dashboard/chart grid; poor at multi-page operational Word documents (Consignments, Invoices) | **Browser-based MS Word Ribbon & Paginated Canvas** usable directly by operations managers |
| **Join Construction** | Manual SQL query or stored procedure written by a developer per report | Manual star-schema modeling required before users can build views | **Automatic Shortest-Path `LEFT JOIN` Compiler** driven by real-time BFS over physical + virtual FKs |
| **Role-Playing FKs (`Origin` vs `Destination`)** | Developer manually writes aliased SQL joins | Requires duplicating dimension tables in the semantic model | **Interactive Role Prompt on Drop** that automatically aliases the target table (`_Origin`, `_Dest`) |
| **Multiple `1:N` Detail Tables** | Requires complex subreport wiring and manual parameter passing | Fails or creates Cartesian row multiplication in flat tables | **Automatic Independent Multi-Repeater Queries** keyed by the Anchor Table PK |
| **Editable `.docx` + Exact PDF Export** | Good export, but templates cannot be edited in browser by business users | Exports CSV/Image PDFs; no native `.docx` mail-merge document generation | **Native Print Preview, Paginated PDF & OpenXML `.docx` Export** + 1-click URL execution from TMS screens |

---

## Sources

- **Project Specification & Requirements:** `.planning/PROJECT.md`
- **Live SQL Server Schema Audit (`TMS_Lite_1_Oct_2026`):**
  - `INFORMATION_SCHEMA.TABLES` (`404` base tables) & `INFORMATION_SCHEMA.COLUMNS` (`5,993` columns)
  - `sys.foreign_keys` & `sys.foreign_key_columns` (`341` physical FKs across `253` tables; `151` tables without physical FKs; `14` multi-FK table pairs; `14` composite FKs; `5` self-referencing FKs)
- **Enterprise Document Generation Patterns:** OpenXML (`.docx`) mail-merge & headless/browser print-CSS pagination standards (`@page`, `break-inside: avoid`, `page-break-after: always`)

---
*Feature research for: Dynamic Word-Like Report Designer & SQL Query Engine (`TMS_Lite_1_Oct_2026`)*
*Researched: 2026-11-13*
