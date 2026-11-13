# Phase 1: Database Foundation, Schema Introspection & FK Multigraph Engine - Discussion Log

**Date:** 2026-11-13
**Mode:** Interactive Gap Analysis & Clarification

## Areas Discussed

### 1. Full-Stack Technology Choice
- **Question:** Which full-stack technology stack should we use to build the application?
- **User Selection:** `ANGULAR+.NET API` (Angular 19 + ASP.NET Core .NET 8 Web API)

### 2. Separate Report Runner Page & Export Architecture
- **Question:** How should PDF and Word (`.docx`) exports and report execution be structured across pages?
- **User Selection:** Save the template JSON (`LayoutJson`, `QueryMetadataJson`, `CompiledSelectQuery`) in the Designer, and on a **separate Report Runner / Generator page** (`/reports/run/:templateId` or via direct URL query parameters for a selected document/field), execute the query, merge the dataset, and generate the PDF/DOCX.

### 3. Gap 1: Multiple Foreign Keys Between Same Tables (Role-Playing Dimensions)
- **Context:** Live audit of `TMS_Lite_1_Oct_2026` found `14` table pairs with multiple FKs between the exact same two tables (e.g., `CL_Thc_Header` has 4 FKs to `CL_Master_Location`; `CL_Tripsheet_Header` has 2 FKs to `CL_Master_Driver`).
- **User Selection:** Prompt user on drop to pick which FK relationship role to use (e.g., Origin vs. Destination Location) and alias each role separately so both can be used in one report.

### 4. Gap 2: 151 Unlinked Tables & Undirected BFS Chasm/Fan Traps (`N -> 1 <- N`)
- **Context:** Out of `404` base tables in `TMS_Lite_1_Oct_2026`, `253` have physical `sys.foreign_keys` constraints and `151` have none. Also, shared lookup tables (`CL_Master_Location`) could cause accidental `N -> 1 <- N` Cartesian fan-outs.
- **User Selection:** Include a **Virtual / Custom Relationships** manager (`Report_Custom_Relationships`) in the Manager Portal for the 151 tables without physical FKs + prevent accidental `N -> 1 <- N` fan-trap joins through shared master tables.

### 5. Gap 4: Master-Detail Merging & Table Footer Aggregates
- **User Selection:** Support both **Single/Batch Document Mode** (group detail rows by Anchor PK, 1 page-broken document per parent record) AND **Summary List Mode** + **Table Footer Aggregates** (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`).

### 6. Additional Gap: Multiple `1:N` Repeating Detail Tables & Dynamic Filter Dropdowns
- **User Selection:** Prevent Cartesian explosion by deduplicating/querying each repeating detail table independently per parent record + auto-populate Filter Dropdowns via `SELECT DISTINCT TOP 500`.
