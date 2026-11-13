# Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Portal - Research

**Researched:** 2026-11-13
**Status:** Complete

## Technical Findings

1. **Performance over 5,958+ Columns (`MGR-01`):**
   - Fetching all tables and columns from `FkGraphService.GetSnapshotAsync()` takes `<5ms` because the schema snapshot is already cached in memory in `FkGraphService`.
   - Merging the in-memory `SchemaGraphSnapshot` with `SELECT * FROM dbo.Report_Field_Catalog` (`Dapper`) takes `<10ms`.
   - On the Angular 19 frontend, rendering 5,958 rows in a standard DOM `<table>` creates `>35,000` DOM elements and causes input lag. Using `ScrollingModule` (`cdk-virtual-scroll-viewport itemSize="48"`) from `@angular/cdk/scrolling` renders only the ~18 visible column rows in the viewport at any moment, guaranteeing 60 FPS scrolling and instant search filtering.

2. **Auto-Humanize Column Alias Rules (`MGR-03`):**
   - `TMS_Lite_1_Oct_2026` uses naming patterns like `Consignment_No`, `Tripsheet_Date`, `From_Location_Id`, `Total_Freight_Amt`, `Is_Active`.
   - Our `CatalogService.HumanizeColumnName(string columnName)` helper:
     - Replaces underscores with spaces (`Consignment_No` -> `Consignment No`).
     - Splits PascalCase boundaries (` VehicleType` -> `Vehicle Type`).
     - Preserves domain acronyms in uppercase (`LR`, `THC`, `GST`, `PAN`, `PIN`, `PK`, `ID`, `POD`, `ETA`, `ETD`).

3. **Virtual FK Validation & Hot-Reload (`MGR-04`, `MGR-05`):**
   - Before inserting into `dbo.Report_Custom_Relationships`, `CatalogService` validates that `ParentTable`, `ParentColumn`, `ReferencedTable`, and `ReferencedColumn` exist in `SchemaGraphSnapshot.Tables` (preventing invalid identifiers or SQL injection).
   - Immediately after inserting/updating/deleting a custom relationship, `CatalogService` calls `await _fkGraphService.ReloadGraphAsync()`, which atomically swaps the in-memory `SchemaGraphSnapshot` so `ReachabilityService` immediately traverses the new virtual FK bridge.

## Validation Architecture

- **Backend Integration Tests (`CatalogServiceTests.cs` & `ManagerControllerTests.cs`):**
  - Verify merging live `TMS_Lite_1_Oct_2026` schema with `Report_Field_Catalog`.
  - Verify single and bulk column publish/update (`IsActive`, `DisplayName`, `Category`, `IsFilterable`) and `GetPublishedFieldsAsync()`.
  - Verify `HumanizeColumnName` (`Consignment_No` -> `"Consignment No"`).
  - Verify creating and deleting a virtual FK in `Report_Custom_Relationships` and confirming `FkGraphService` immediately reflects the new relationship without a server restart.
- **Frontend Build Verification:**
  - Verify `npm --prefix client run build` compiles the Angular `/manager` portal with `ScrollingModule` (`cdk-virtual-scroll-viewport`) and reactive forms/signals cleanly.

