# Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Portal - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the full-stack **Manager Data Dictionary & Virtual Relationship Governance Portal** (`/manager` in Angular + `/api/manager/*` in ASP.NET Core):
1. Browse, search, and filter all `404+` tables and `~6,000` columns from `TMS_Lite_1_Oct_2026` merged with persisted governance metadata from `dbo.Report_Field_Catalog` (`MGR-01`).
2. Toggle `IsActive` (`Published / Active`), edit `DisplayName` (`Presentable Alias`), assign `Category`, and toggle `IsFilterable` for individual columns or in bulk (`MGR-02`, `MGR-03`).
3. Auto-Humanize raw SQL column identifiers (`Consignment_No` -> `"Consignment No"`, `From_Location_Id` -> `"From Location"`) across a single table or the entire catalog (`MGR-03`).
4. Manage Virtual/Custom Foreign Key Relationships (`dbo.Report_Custom_Relationships`) so managers can bridge any of the `151` unlinked tables into the Foreign Key Multigraph (`MGR-04`).
5. Trigger immediate in-memory multigraph & catalog reload (`FkGraphService.ReloadGraphAsync()`) on every save so changes are immediately visible to the Report Designer without restarting the API (`MGR-05`).

</domain>

<decisions>
## Implementation Decisions

### Catalog Merge & Persistence Strategy
- **D-01 (Merged Schema + Catalog View):** The backend `CatalogService` merges live schema metadata from `FkGraphService.GetSnapshotAsync()` (`404+` tables, `5,958+` base columns) with persisted rows in `dbo.Report_Field_Catalog`. Columns not yet saved in `Report_Field_Catalog` are synthesized with `IsActive = false`, `DisplayName = AutoHumanize(ColumnName)`, `Category = DeriveCategory(TableName)`, and `IsFilterable = false`.
- **D-02 (Upsert Idempotency & Real-Time Sync):** Saving a single column or a batch of columns executes an idempotent SQL `MERGE` / upsert into `dbo.Report_Field_Catalog` keyed by `(SchemaName, TableName, ColumnName)` and immediately exposes active published fields via `GET /api/manager/published-fields`.
- **D-03 (Bulk Governance & Auto-Humanize):** Managers can click **"Publish All in Table"**, **"Unpublish All in Table"**, or **"Auto-Humanize Aliases"** (which transforms snake_case/camelCase column names like `Consignment_No` into `"Consignment No"` and strips trailing `_Id` where appropriate).
- **D-04 (Virtual FK Bridge Governance for 151 Unlinked Tables):** Managers can view unlinked tables (`HasPhysicalForeignKeys == false`), create a custom relationship (`ParentTable.ParentColumn -> ReferencedTable.ReferencedColumn` with a custom `RoleLabel`), or delete/toggle existing custom relationships in `dbo.Report_Custom_Relationships`, automatically invoking `FkGraphService.ReloadGraphAsync()`.
- **D-05 (High-Density Virtual Scrolled Angular Portal):** The `/manager` component uses `@angular/cdk/scrolling` (`cdk-virtual-scroll-viewport`) to render thousands of columns at 60 FPS alongside a searchable table sidebar, quick filter pills (`All Tables`, `Published Only`, `Has Physical FKs`, `Unlinked Tables (151)`), and a dedicated **Virtual Relationship Builder** tab/drawer.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md` (`MGR-01`, `MGR-02`, `MGR-03`, `MGR-04`, `MGR-05`)
- `.planning/phases/01-database-foundation-schema-introspection-fk-multigraph-engine/01-CONTEXT.md`
- `src/TmsReportDesigner.Api/Services/FkGraphService.cs`

</canonical_refs>

