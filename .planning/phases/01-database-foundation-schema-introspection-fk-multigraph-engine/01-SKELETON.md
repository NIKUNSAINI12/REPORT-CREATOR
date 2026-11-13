# Walking Skeleton — Dynamic Word-Like Report Designer & SQL Query Engine

**Phase:** 1
**Generated:** 2026-11-13

## Capability Proven End-to-End

> A user can open the Angular application, which queries the ASP.NET Core Web API connected to `TMS_Lite_1_Oct_2026`, initializes the three report governance tables (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`), and displays live schema & Foreign Key multigraph statistics (`404` tables, `5,993` columns, `341` physical FKs) with interactive BFS reachability inspection.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend Framework | Angular 19 (Standalone Components, Signals, CDK) in `client/` | Fine-grained reactivity for 5,993-column virtual scrolling, MS Word Ribbon state, and BFS sidebar locking (`D-01`) |
| Backend Framework | ASP.NET Core (.NET 8.0) Web API in `src/TmsReportDesigner.Api/` | High-speed SQL Server introspection, in-memory BFS multigraph, and OpenXML/PDF export ecosystem (`D-01`) |
| Data Access Layer | `Microsoft.Data.SqlClient` + `Dapper` | Sub-50ms metadata introspection and dynamic parameterized SQL execution without EF Core static entity overhead (`D-01`, `D-02`) |
| FK Graph Model | Labeled Multigraph (`FkGraphService`) with Cardinality-Aware BFS (`ReachabilityService`) | Preserves all 14 multi-FK role pairs, 14 composite FKs, 5 self-joins, and custom virtual FKs while blocking `N -> 1 <- N` chasm traps (`D-03`, `D-04`, `D-05`, `D-06`) |
| Directory Layout | `src/TmsReportDesigner.Api/`, `tests/TmsReportDesigner.Tests/`, `client/`, `scripts/` | Clean separation of .NET API, automated xUnit test suite, Angular SPA, and SQL DDL scripts |

## Stack Touched in Phase 1

- [x] Project scaffold (`.NET 8` solution + Web API + xUnit test project + `Angular 19` SPA workspace)
- [x] Routing — Angular shell routes (`/manager`, `/designer`, `/reports`) + `.NET` `/api/schema/*` endpoints
- [x] Database — Idempotent DDL write (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`) + live metadata & FK read from `TMS_Lite_1_Oct_2026`
- [x] UI — Angular navigation shell wired to `/api/schema/status` displaying live DB connection & graph metrics
- [x] Deployment — Local full-stack run configuration (`dotnet run` + `ng serve` with proxy)

## Out of Scope (Deferred to Later Slices)

- Manager Data Dictionary virtual-scroll CRUD & Virtual Relationship Builder UI (Phase 2)
- Full 5-tab MS Word Ribbon & Paginated ProseMirror/TipTap Canvas (Phase 3)
- Drag-and-drop field pills, Role-Playing FK modal, Filter Builder, and Dynamic T-SQL Compiler (Phase 4)
- Separate Report Runner Page (`/reports/run/:templateId`), Master-Detail Merge Engine, and PDF/DOCX Export (Phase 5)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** Module 1 — Manager Data Dictionary & Virtual Relationship Portal (`/manager`)
- **Phase 3:** Module 2A — Complete MS Word Ribbon & Paginated Document Canvas (`/designer`)
- **Phase 4:** Module 2B/2C & Module 3 — Field Binding, FK Locking, Filter Builder & Dynamic T-SQL Compiler
- **Phase 5:** Module 4 — Separate Report Runner Page (`/reports/run/:templateId`), Multi-Repeater Merge & Print/PDF/DOCX Export
