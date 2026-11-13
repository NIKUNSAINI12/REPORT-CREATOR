---
phase: 01-database-foundation-schema-introspection-fk-multigraph-engine
plan: 02
subsystem: schema-introspection
tags: [sqlserver, information-schema, foreign-keys, multigraph, dapper]
requires:
  - phase: 01-01
    provides: "IDbConnectionFactory and Report_Custom_Relationships table"
provides:
  - "SchemaIntrospectionService querying INFORMATION_SCHEMA.TABLES, INFORMATION_SCHEMA.COLUMNS, sys.indexes, and sys.foreign_keys"
  - "FkGraphService building a thread-safe Labeled Multigraph supporting 341 physical FKs, 14 composite FKs, 14 multi-FK pairs, 5 self-referencing FKs, and custom virtual FKs"
affects: [01-03, phase-02, phase-04]
tech-stack:
  added: []
  patterns: ["Labeled Multigraph keyed by ConstraintName", "Atomic Snapshot Swap via Interlocked.Exchange"]
key-files:
  created:
    - src/TmsReportDesigner.Api/Models/SchemaModels.cs
    - src/TmsReportDesigner.Api/Services/ISchemaIntrospectionService.cs
    - src/TmsReportDesigner.Api/Services/SchemaIntrospectionService.cs
    - src/TmsReportDesigner.Api/Services/IFkGraphService.cs
    - src/TmsReportDesigner.Api/Services/FkGraphService.cs
    - tests/TmsReportDesigner.Tests/SchemaIntrospectionTests.cs
    - tests/TmsReportDesigner.Tests/FkGraphServiceTests.cs
  modified:
    - src/TmsReportDesigner.Api/Program.cs
key-decisions:
  - "Grouped sys.foreign_key_columns by constraint_object_id ordered by constraint_column_id so all 14 composite FKs emit multi-column join pairs on a single FkEdge."
  - "Keyed multigraph edges by ConstraintName rather than (FromTable, ToTable) so all 14 multi-FK table pairs (including 4 FKs from CL_Thc_Header to CL_Master_Location) are preserved."
patterns-established:
  - "Thread-safe ReloadGraphAsync() rebuilds an immutable SchemaGraphSnapshot and swaps it atomically."
requirements-completed: [SCHEMA-02, SCHEMA-03]
duration: 6min
completed: 2026-11-13
---

# Phase 1 Plan 02: Schema Introspection & Labeled Multigraph Summary

**Implemented `SchemaIntrospectionService` and `FkGraphService` to introspect all 404+ tables, 5,993+ columns, and 341 physical + virtual foreign keys into a thread-safe in-memory Labeled Multigraph.**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files created/modified:** 8

## Accomplishments
- Implemented `SchemaIntrospectionService` querying `INFORMATION_SCHEMA.TABLES`, `INFORMATION_SCHEMA.COLUMNS`, primary keys, physical foreign keys (`sys.foreign_keys` + `sys.foreign_key_columns`), and `dbo.Report_Custom_Relationships`.
- Implemented `FkGraphService` producing bidirectional `ManyToOne` (`N -> 1`) and `OneToMany` (`1 -> N`) multigraph edges with derived role labels, composite column pairs, self-join flags, and virtual FK hot-reloading.
- Verified against `TMS_Lite_1_Oct_2026` via `SchemaIntrospectionTests` and `FkGraphServiceTests` (`CL_Thc_Header -> CL_Master_Location` resolves 4 distinct FK edges; `CL_Tripsheet_Header -> CL_Master_Driver` resolves 2 distinct edges; `14` composite FKs and `5` self-FKs verified).

