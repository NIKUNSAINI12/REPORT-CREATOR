# Phase 1: Database Foundation, Schema Introspection & FK Multigraph Engine - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `.NET 8 Web API` + `Angular 19` workspace structure, provision the SQL Server tables (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`) in `TMS_Lite_1_Oct_2026`, introspect all `404` base tables, `5,993` columns, and `341` physical foreign keys, and expose the **Cardinality-Aware Foreign Key Multigraph & BFS Reachability Service** over REST endpoints.

</domain>

<decisions>
## Implementation Decisions

### Tech Stack & Database Connectivity
- **D-01:** Use **ASP.NET Core (.NET 8.0 LTS) Web API** with `Microsoft.Data.SqlClient` and `Dapper` for backend persistence and schema introspection, paired with an **Angular 19 (Standalone + Signals)** frontend workspace — **Reversibility:** costly — Changing backend/frontend frameworks later would require rewriting all services and UI components.
- **D-02:** Store SQL Server connection string (`Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;`) in `appsettings.json` and auto-run idempotent DDL migrations on startup for `Report_Field_Catalog`, `Report_Custom_Relationships`, and `Saved_Report_Templates`.

### Foreign Key Multigraph & Role-Playing Disambiguation
- **D-03:** Model the Foreign Key graph as a **Labeled Multigraph** keyed by `ConstraintName` (or `RelationshipId` for virtual FKs) rather than a simple `(TableA, TableB)` adjacency matrix, so all `14` same-table multi-FK pairs in `TMS_Lite_1_Oct_2026` (e.g., `CL_Thc_Header` -> `CL_Master_Location` which has 4 FKs, and `CL_Tripsheet_Header` -> `CL_Master_Driver` which has 2 FKs) preserve every individual relationship role.
- **D-04:** Group `sys.foreign_key_columns` by `constraint_object_id` so all `14` composite (multi-column) foreign keys in `TMS_Lite_1_Oct_2026` are stored as ordered column pairs on a single graph edge, and support the `5` self-referencing FKs via distinct table alias generation.

### Virtual Relationships & Chasm-Trap (`N -> 1 <- N`) Prevention
- **D-05:** Include `Report_Custom_Relationships` in the Phase 1 DDL and merge active custom relationships into the in-memory FK multigraph alongside `sys.foreign_keys` so the `151` tables lacking physical FK constraints can participate in BFS reachability.
- **D-06:** Enforce **Cardinality-Aware BFS Traversal**: allow `ManyToOne` (`N -> 1`, child/transaction to parent/master lookup) and `OneToMany` (`1 -> N`, parent header to child repeater detail), but **block `N -> 1 <- N` chasm/fan-trap transitions** where two unrelated transaction tables would join backwards through a shared master lookup table (such as `CL_Master_Location` or `CL_Master_User`).

### Downstream Contract Support (Phase 4 & Phase 5 Readiness)
- **D-07:** Ensure `Saved_Report_Templates` DDL includes columns for `TemplateId`, `TemplateName`, `Description`, `AnchorTableName`, `DocumentMode` (`SingleOrBatchDocument` vs `SummaryList`), `LayoutJson`, `QueryMetadataJson`, `CompiledSelectQuery`, `IsActive`, `CreatedAt`, and `UpdatedAt`.

### the agent's Discretion
- Exact C# project/folder layout within the `.NET 8` solution (`TmsReportDesigner.Api`) and Angular workspace (`tms-report-designer-ui`).
- In-memory caching mechanism (`IMemoryCache` / singleton graph state with atomic reload method `ReloadGraphAsync()` when catalog or virtual relationships change).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements Specs
- `.planning/PROJECT.md` — Full project vision, live `TMS_Lite_1_Oct_2026` audit numbers, and architectural decisions
- `.planning/REQUIREMENTS.md` — Requirements `SCHEMA-01`, `SCHEMA-02`, `SCHEMA-03`, `SCHEMA-04` mapped to Phase 1
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and 3-plan breakdown

### Research Artifacts
- `.planning/research/STACK.md` — Verified `.NET 8`, `Dapper`, `Microsoft.Data.SqlClient`, and `Angular 19` stack specifications
- `.planning/research/ARCHITECTURE.md` — Detailed schema introspection SQL queries, multigraph data structures, and component boundaries
- `.planning/research/PITFALLS.md` — Specific SQL Server and BFS graph pitfalls (`14` multi-FK pairs, `14` composite FKs, `5` self-joins, `N -> 1 <- N` chasm traps)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Greenfield repository (`C:\Users\USER\Desktop\TMS REPORT DESIGNER`) connected to existing live SQL Server database `TMS_Lite_1_Oct_2026` on `localhost`.

### Established Patterns
- Live database `TMS_Lite_1_Oct_2026` uses `CL_Master_*` for master lookup tables and `CL_*_Header` / `CL_*_Detail` for transaction tables.

### Integration Points
- Connects directly to `localhost` SQL Server (`TMS_Lite_1_Oct_2026`) via `Microsoft.Data.SqlClient`.

</code_context>

<specifics>
## Specific Ideas

- When multiple FKs exist between two tables (such as `CL_Thc_Header` -> `CL_Master_Location`), the BFS reachability API must return the list of available FK edges/roles (`ConstraintName`, `ParentColumns`, `ReferencedColumns`, friendly role label derived from the FK column name like `"Origin Location"` / `"Destination Location"`) so the Angular Designer can prompt the user on drop.

</specifics>

<deferred>
## Deferred Ideas

- Manager Portal UI for editing catalog & custom relationships (covered in Phase 2)
- MS Word Ribbon & Paginated Canvas UI (covered in Phase 3)
- Field Drag-and-Drop, Filter Builder & T-SQL Compiler (covered in Phase 4)
- Separate Report Runner Page (`/reports/run/:templateId`) & PDF/DOCX Export (covered in Phase 5)

</deferred>

---

*Phase: 01-database-foundation-schema-introspection-fk-multigraph-engine*
*Context gathered: 2026-11-13*

