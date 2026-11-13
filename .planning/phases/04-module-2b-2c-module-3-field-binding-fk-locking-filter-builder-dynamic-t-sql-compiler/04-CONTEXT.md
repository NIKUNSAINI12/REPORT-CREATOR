# Phase 4: Module 2B, 2C & Module 3 — Field Binding, FK Locking, Filter Builder & Dynamic T-SQL Compiler - Context

**Gathered:** 2026-11-13
**Status:** Ready for execution

<domain>
## Phase Boundary

Deliver **Database Field Drag-and-Drop, Real-Time Foreign Key Reachability Sidebar Locking, Role-Playing FK Disambiguation, Inline Field Formatting, Runtime Filter Builder, and the Dynamic Parameterized T-SQL Compiler & Template Persistence** (`BIND-01`..`BIND-06`):
1. **Zero-State & Anchor-State FK Reachability Locking (`BIND-01`):**
   - Zero-State (0 fields on canvas): All published fields in the right-hand sidebar are enabled and draggable.
   - Anchor-State (1+ fields on canvas): First dropped field's table becomes `AnchorTable`. On every field drop or deletion, call `POST /api/schema/reachability` and visually lock any field from an unreachable table (`greyed out`, `draggable="false"`, tooltip `"Cannot add: No Foreign Key relationship with selected tables"`). Removing all fields resets to Zero-State.
2. **Role-Playing Foreign Key Disambiguation (`BIND-02`):**
   - When dropping a field from a table with `RequiresRoleDisambiguation == true` (e.g., `CL_Thc_Header -> CL_Master_Location` has 4 FKs), prompt the user to select the specific FK role (`From Location`, `To Location`, `Current Location`, etc.), assign a distinct SQL table alias (`[CL_Master_Location__From_Location_Id]`), and bind the merge tag to that role alias.
3. **Scalar Merge Tags, Repeating Table Rows & Table Footer Aggregates (`BIND-03`):**
   - Inline Scalar Merge Tags (`{{TableAlias.DisplayName}}` with `data-field-id`, `data-table`, `data-column`, `data-alias`, `data-format`).
   - Repeating Table Row Binding (`<tr data-repeater="true" data-repeater-table="TableName">`).
   - Table Summary Footer Row (`<tr data-summary-footer="true">`) supporting `SUM`, `COUNT`, `AVG`, `MIN`, `MAX` aggregate tags.
4. **Right-Click Field Formatting (`BIND-04`):**
   - Context popover on any dropped merge tag pill allowing Date format (`dd-MM-yyyy`, `dd-MMM-yyyy`, `yyyy-MM-dd`, `dd/MM/yyyy HH:mm`), Currency/Number format (`₹ #,##0.00`, `$ #,##0.00`, `#,##0.00`, `#,##0`), Text Case (`UPPERCASE`, `lowercase`, `Title Case`), Aggregate function (`NONE`, `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), and Default value if `NULL` (e.g., `"N/A"`, `"0.00"`).
5. **Runtime Filter Builder (`BIND-05`):**
   - Configure runtime filters from any reachable published field with `FilterLabel`, `Operator` (`=`, `!=`, `IN`, `BETWEEN`, `LIKE`, `>`, `<`, `>=`, `<=`), auto-mapped `UIControlType` (`DateRangePicker` / `DatePicker` for `date/datetime`, `MultiSelect` / `Dropdown` / `Text` for `varchar/nvarchar`, `NumberInput` for `int/decimal/numeric`, `Checkbox` for `bit`), `IsRequired`, and optional `DefaultValue`.
6. **Dynamic T-SQL Compiler & Template Persistence (`BIND-06`):**
   - Backend `SqlCompilerService` validates every selected table, column, join step, and filter against `SchemaGraphSnapshot`, generates bracket-quoted `SELECT ... FROM [dbo].[AnchorTable] AS [AnchorTable] LEFT JOIN ... WHERE 1=1 /*DYNAMIC_FILTERS*/`, and persists `LayoutJson`, `QueryMetadataJson`, and `CompiledSelectQuery` in `dbo.Saved_Report_Templates`.

</domain>

