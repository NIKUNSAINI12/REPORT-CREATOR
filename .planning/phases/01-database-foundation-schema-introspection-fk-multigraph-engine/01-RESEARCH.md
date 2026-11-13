# Phase 1: Database Foundation, Schema Introspection & FK Multigraph Engine — Research

**Phase:** `01` (`database-foundation-schema-introspection-fk-multigraph-engine`)
**Researched:** 2026-11-13
**Requirements Covered:** `SCHEMA-01`, `SCHEMA-02`, `SCHEMA-03`, `SCHEMA-04`

## 1. Live Database Audit Findings (`TMS_Lite_1_Oct_2026`)

Direct introspection against `Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;` confirmed:
- **Base Tables:** `404` (`INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`)
- **Columns:** `5,993` (`INFORMATION_SCHEMA.COLUMNS`)
- **Physical Foreign Keys:** `341` (`sys.foreign_keys`)
- **Connected Tables in Physical FK Graph:** `253` (`215` with outgoing FKs, `83` with incoming FKs)
- **Unlinked Base Tables:** `151` tables have no physical `sys.foreign_keys` constraints and require `Report_Custom_Relationships` (`D-05`).
- **Same-Table Multi-FK Pairs:** `14` pairs where the same parent table has multiple foreign keys referencing the exact same target table (`D-03`), including:
  - `CL_Thc_Header` → `CL_Master_Location` (`4` FKs)
  - `CL_Tripsheet_Header` → `CL_Master_Driver` (`2` FKs)
  - `CL_Tripsheet_Header` → `CL_Master_Location` (`2` FKs)
  - `CL_Order_Header` → `CL_Master_Address` (`2` FKs)
  - `CL_Flight_Schedule_Header` → `CL_Master_Airport` (`2` FKs)
  - `CL_Account_Transaction` → `CL_Master_Account` (`2` FKs)
- **Composite Foreign Keys:** `14` constraints have `>1` column in `sys.foreign_key_columns` (`D-04`).
- **Self-Referencing Foreign Keys:** `5` constraints have `parent_object_id = referenced_object_id` (`D-04`).

## 2. Persistence DDL Design (`SCHEMA-01`, `D-02`, `D-05`, `D-07`)

Three governance and template tables must be created idempotently in `TMS_Lite_1_Oct_2026` (`scripts/001_init_report_tables.sql` and executed on startup by `DatabaseInitializer`):
1. `dbo.Report_Field_Catalog`:
   - `FieldId INT IDENTITY(1,1) PRIMARY KEY`
   - `SchemaName NVARCHAR(128) NOT NULL DEFAULT 'dbo'`
   - `TableName NVARCHAR(256) NOT NULL`
   - `ColumnName NVARCHAR(256) NOT NULL`
   - `DataType NVARCHAR(128) NOT NULL`
   - `IsNullable BIT NOT NULL DEFAULT 1`
   - `DisplayName NVARCHAR(256) NOT NULL`
   - `Category NVARCHAR(256) NOT NULL DEFAULT 'General'`
   - `IsFilterable BIT NOT NULL DEFAULT 0`
   - `IsActive BIT NOT NULL DEFAULT 1`
   - `UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
   - Unique index `UX_Report_Field_Catalog_Schema_Table_Col` on `(SchemaName, TableName, ColumnName)`.
2. `dbo.Report_Custom_Relationships`:
   - `RelationshipId INT IDENTITY(1,1) PRIMARY KEY`
   - `ConstraintName NVARCHAR(256) NOT NULL UNIQUE`
   - `ParentSchema NVARCHAR(128) NOT NULL DEFAULT 'dbo'`
   - `ParentTable NVARCHAR(256) NOT NULL`
   - `ParentColumn NVARCHAR(256) NOT NULL`
   - `ReferencedSchema NVARCHAR(128) NOT NULL DEFAULT 'dbo'`
   - `ReferencedTable NVARCHAR(256) NOT NULL`
   - `ReferencedColumn NVARCHAR(256) NOT NULL`
   - `RoleLabel NVARCHAR(256) NULL`
   - `IsActive BIT NOT NULL DEFAULT 1`
   - `CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
3. `dbo.Saved_Report_Templates`:
   - `TemplateId INT IDENTITY(1,1) PRIMARY KEY`
   - `TemplateName NVARCHAR(256) NOT NULL`
   - `Description NVARCHAR(1000) NULL`
   - `AnchorTableName NVARCHAR(256) NULL`
   - `DocumentMode NVARCHAR(64) NOT NULL DEFAULT 'SingleOrBatchDocument'`
   - `LayoutJson NVARCHAR(MAX) NOT NULL`
   - `QueryMetadataJson NVARCHAR(MAX) NOT NULL`
   - `CompiledSelectQuery NVARCHAR(MAX) NOT NULL`
   - `IsActive BIT NOT NULL DEFAULT 1`
   - `CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
   - `UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`

## 3. Labeled Multigraph & Cardinality-Aware BFS (`SCHEMA-03`, `SCHEMA-04`, `D-03`, `D-04`, `D-06`)

- **Edge Representation:** Each FK constraint is represented as two directed half-edges in the adjacency list of `FkGraphService`:
  - `ManyToOne` (`N -> 1`): `ParentTable -> ReferencedTable` (outgoing FK from child/transaction table to parent/master lookup table).
  - `OneToMany` (`1 -> N`): `ReferencedTable -> ParentTable` (incoming FK from parent/header table to child/detail repeater table).
- **Chasm-Trap Prevention (`D-06`):**
  - During BFS traversal from an active table set, track the path's cardinality state (`CanTraverseOneToMany`).
  - Once a path has traversed a `ManyToOne` (`N -> 1`) edge to reach a master/lookup table (e.g., `CL_Order_Header -> CL_Master_Location`), the BFS **must not** subsequently traverse a `OneToMany` (`1 -> N`) edge out of that master lookup table into an unrelated transaction table (e.g., `CL_Master_Location -> CL_Thc_Header`).
  - Valid transitions:
    - `1 -> N` followed by `N -> 1` (e.g., `CL_Tripsheet_Header -> CL_Tripsheet_Detail -> CL_Master_PackageType`) is valid!
    - `N -> 1` followed by `N -> 1` (e.g., `CL_Tripsheet_Header -> CL_Master_Location -> CL_Master_State`) is valid!
    - `N -> 1` followed by `1 -> N` (`N -> 1 <- N` chasm/fan trap through shared lookup table) is **BLOCKED**!
- **Multi-FK Role Disambiguation (`D-03`):**
  - When multiple edges connect the same `(FromTable, ToTable)` along a hop, the reachability result returns all parallel `FkEdge` descriptors (`ConstraintName`, `RoleLabel`, `ColumnPairs`, `IsComposite`, `IsSelfReferencing`, `IsVirtual`) so the frontend can prompt the user to disambiguate roles (e.g., Origin vs. Destination Location).

## Validation Architecture

- **Test Runner:** `dotnet test` using **xUnit** (`tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj`).
- **Verification Strategy:**
  - Automated integration & unit tests against `TMS_Lite_1_Oct_2026` verifying:
    1. Idempotent creation of `Report_Field_Catalog`, `Report_Custom_Relationships`, and `Saved_Report_Templates`.
    2. Schema introspection returning `>= 404` base tables and `>= 5,993` columns in `< 500ms`.
    3. Multigraph loading all `341` physical FKs including `14` composite FKs, `14` multi-FK pairs (`CL_Thc_Header` -> `CL_Master_Location` returning 4 distinct edges), `5` self-referencing FKs, plus virtual FKs from `Report_Custom_Relationships`.
    4. Cardinality-aware BFS reachability permitting `N -> 1 -> 1` and `1 -> N -> 1` while blocking `N -> 1 <- N` chasm traps through `CL_Master_Location`.

