# Architecture Research

**Domain:** Enterprise WYSIWYG Report Designer, Data Dictionary Governance & Dynamic T-SQL Execution/Export Engine (`TMS_Lite_1_Oct_2026`)
**Researched:** 2026-11-13
**Confidence:** HIGH

---

## Standard Architecture

### System Overview

The system follows a strict **3-tier decoupled architecture** separating **Schema Governance (Module 1)**, **Visual Template Authoring & Query Compilation (Modules 2 & 3)**, and **Parameterized Report Execution & Document Export (Module 4)** across an **Angular 17+ SPA**, an **ASP.NET Core (.NET 8) Web API**, and **Microsoft SQL Server (`TMS_Lite_1_Oct_2026`)**.

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                              ANGULAR 17+ FRONTEND SPA                                     │
├───────────────────────────┬─────────────────────────────────┬─────────────────────────────┤
│  Module 1: Manager Portal │  Module 2: Word-Like Designer   │  Module 4: Report Runner    │
│  (/manager/dictionary)    │  (/designer, /designer/:id)     │  (/reports/run/:templateId) │
│                           │                                 │                             │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │  ┌───────────────────────┐  │
│  │ CDK Virtual Grid    │  │  │ 5-Tab MS Word Ribbon UI   │  │  │ Dynamic Filter Bar &  │  │
│  │ (5,993 Columns)     │  │  │ + Paginated A4/Letter DOM │  │  │ URL Query Param Parser│  │
│  ├─────────────────────┤  │  ├───────────────────────────┤  │  ├───────────────────────┤  │
│  │ Virtual FK Builder  │  │  │ Reachability-Locked Field │  │  │ Paginated HTML Viewer │  │
│  │ (151 Unlinked Tbls) │  │  │ Sidebar + Role Prompt UI  │  │  │ + Print / PDF / DOCX  │  │
│  └──────────┬──────────┘  │  └─────────────┬─────────────┘  │  └───────────┬───────────┘  │
└─────────────┼─────────────┴────────────────┼────────────────┴──────────────┼──────────────┘
              │ REST / JSON                  │ REST / JSON                   │ REST / JSON / Blob
┌─────────────▼──────────────────────────────▼───────────────────────────────▼──────────────┐
│                          ASP.NET CORE (.NET 8) WEB API LAYER                              │
├───────────────────────────┬─────────────────────────────────┬─────────────────────────────┤
│  Schema & Graph Service   │  Dynamic T-SQL Compiler &       │  Document Merge & Export    │
│                           │  Parameterized Execution Engine │  Service                    │
│  ┌─────────────────────┐  │  ┌───────────────────────────┐  │  ┌───────────────────────┐  │
│  │ SchemaIntrospector  │  │  │ Anchor + N:1 Master Query │  │  │ Anchor PK Grouping &  │  │
│  │ (404 Tbls, 341 FKs) │  │  │ Builder (Bracket-Quoted)  │  │  │ 1:N Repeater Stitching│  │
│  ├─────────────────────┤  │  ├───────────────────────────┤  │  ├───────────────────────┤  │
│  │ Cardinality-Aware   │  │  │ Independent 1:N Repeater  │  │  │ Footer Aggregations & │  │
│  │ BFS Reachability &  │  │  │ Query Split Engine        │  │  │ Token/Format Resolver │  │
│  │ Chasm-Trap Guard    │  │  ├───────────────────────────┤  │  ├───────────────────────┤  │
│  ├─────────────────────┤  │  │ SqlParameter Expander     │  │  │ PDF Renderer &        │  │
│  │ Role-Playing FK     │  │  │ (IN / BETWEEN / TOP 500)  │  │  │ OpenXML (.docx) Engine│  │
│  │ Disambiguator       │  │  └─────────────┬─────────────┘  │  └───────────┬───────────┘  │
│  └──────────┬──────────┘  │                │                │              │              │
└─────────────┼─────────────┴────────────────┼────────────────┴──────────────┼──────────────┘
              │ ADO.NET / Dapper             │ Parameterized SqlCommand      │
┌─────────────▼──────────────────────────────▼───────────────────────────────▼──────────────┐
│                    MICROSOFT SQL SERVER (TMS_Lite_1_Oct_2026)                             │
├────────────────────────────────────────────┬──────────────────────────────────────────────┤
│  Governance & Template Persistence Tables  │  Live Operational TMS Schema (Read-Only)     │
│  ┌──────────────────────────────────────┐  │  ┌────────────────────────────────────────┐  │
│  │ dbo.Report_Field_Catalog             │  │  │ 404 Base Tables / 5,993 Columns        │  │
│  │ dbo.Report_Custom_Relationships      │  │  │ 341 Physical FKs (14 Composite,        │  │
│  │ dbo.Saved_Report_Templates           │  │  │ 14 Multi-FK Role Pairs, 5 Self-Ref)    │  │
│  └──────────────────────────────────────┘  │  └────────────────────────────────────────┘  │
└────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

---

## Component Boundaries & Responsibilities

| Component | Bounded Context / Ownership | Key Technical Responsibilities |
|-----------|-----------------------------|--------------------------------|
| **1. SQL Server Persistence Layer** | `dbo.Report_Field_Catalog`, `dbo.Report_Custom_Relationships`, `dbo.Saved_Report_Templates` | Stores governed column aliases, publish flags, filterability toggles, formatting hints, virtual foreign keys for the 151 unlinked tables, and serialized report templates (`LayoutJson`, `QueryMetadataJson`, `CompiledSelectQuery`). |
| **2. .NET Schema Introspection & Cardinality-Aware BFS Graph Service** | `SchemaIntrospectionService`, `RelationshipGraphService` | Queries `INFORMATION_SCHEMA` and `sys.foreign_keys` / `sys.foreign_key_columns` (404 tables, 5,993 columns, 341 physical FKs), merges `Report_Custom_Relationships`, models directed `N:1` (Child → Parent) and `1:N` (Parent → Child) edges with composite key support (14 FKs), self-joins (5 FKs), and role-playing multi-FK edges (14 pairs), and executes Cardinality-Aware BFS to prevent `N -> 1 <- N` chasm traps. |
| **3. .NET Dynamic T-SQL Compiler & Parameterized Execution Engine** | `DynamicSqlCompiler`, `ReportExecutionService`, `FilterLookupService` | Compiles validated `QueryMetadataJson` into bracket-quoted T-SQL (`[dbo].[Table].[Col]`). Splits execution into **(a)** one Master Query (`Anchor` + all `N:1` parent joins with role aliases) and **(b)** independent Child Queries per `1:N` repeating table (preventing Cartesian product multiplication). Binds all filters via `SqlParameter`, expands `IN` (`@p0_0, @p0_1`) and `BETWEEN` (`@p0_start, @p0_end`), and serves `SELECT DISTINCT TOP 500` filter lookups. |
| **4. .NET Document Merge & PDF/DOCX Export Service** | `DocumentMergeEngine`, `PdfExportService`, `DocxExportService` | Groups master rows by Anchor Primary Key (Single vs. Batch Document Mode), stitches child repeater rows into matching `<tr data-repeater="true">` blocks per Anchor PK, computes footer aggregations (`SUM`, `COUNT`, `AVG`, `MIN`, `MAX`), applies field formatting (Date, INR Currency `₹ #,##0.00`, Case, Null default) and system tokens (`Page X of Y`, `Current Date/Time`, `Printed By`), and exports print-accurate PDF and OpenXML `.docx` files. |
| **5. Angular Manager Portal** | `/manager/dictionary`, `/manager/relationships` | Renders 404 tables and 5,993 columns using Angular CDK Virtual Scroll, provides instant search/category filtering, auto-humanizes snake/camel-case column names (`Consignment_No` → `"Consignment No"`), supports bulk publish/unpublish, and provides a visual Virtual FK Relationship Builder for the 151 unlinked tables. |
| **6. Angular MS Word Ribbon & Paginated Canvas Editor** | `/designer`, `/designer/:id` | Provides the 5-tab MS Word Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`), ruler-equipped paginated canvas (A4/Letter/Legal/A3/A5, Portrait/Landscape, Margins, Watermarks, Headers/Footers), drag-and-drop field insertion (`{{RoleAlias.DisplayName}}`), Role Disambiguation prompt modal when multiple FKs exist between two tables, multiple independent `1:N` table repeaters, and the Runtime Filter Builder UI. |
| **7. Angular Separate Report Runner Page** | `/reports/run/:templateId` | Standalone execution route supporting interactive filter entry (with `TOP 500` searchable dropdowns) **and** zero-click URL query parameter execution (e.g., `/reports/run/5?Tripsheet_Id=1042&autoRun=true`), toggling between Single/Batch Document View and Summary List Mode, with 1-click Browser Print, PDF download, and `.docx` export. |

---

### Deep-Dive: Component Specifications

#### 1. SQL Server Persistence (`TMS_Lite_1_Oct_2026`)
Three metadata tables reside in `dbo` alongside the 404 operational TMS tables:
- **`dbo.Report_Field_Catalog`**:
  - `FieldId INT IDENTITY(1,1) PRIMARY KEY`
  - `TableSchema NVARCHAR(128) NOT NULL DEFAULT 'dbo'`
  - `TableName NVARCHAR(256) NOT NULL`
  - `ColumnName NVARCHAR(256) NOT NULL`
  - `DisplayName NVARCHAR(256) NOT NULL` (auto-humanized default, editable by Manager)
  - `CategoryName NVARCHAR(128) NULL` (e.g., `"Operations - Consignment"`, `"Finance - Billing"`, `"Masters"`)
  - `DataType NVARCHAR(64) NOT NULL`, `MaxLength INT NULL`, `IsNullable BIT NOT NULL`, `IsPrimaryKey BIT NOT NULL`
  - `IsPublished BIT NOT NULL DEFAULT 0`, `IsFilterable BIT NOT NULL DEFAULT 1`
  - `DefaultFormatType NVARCHAR(64) NULL` (`Date`, `Currency`, `Number`, `Text`)
  - `Unique Constraint`: `UQ_Report_Field_Catalog_Schema_Table_Column (TableSchema, TableName, ColumnName)`
- **`dbo.Report_Custom_Relationships`**:
  - `RelationshipId INT IDENTITY(1,1) PRIMARY KEY`
  - `ConstraintName NVARCHAR(256) NOT NULL UNIQUE` (e.g., `VFK_Tripsheet_Driver_Secondary`)
  - `RoleLabel NVARCHAR(128) NULL` (e.g., `"Origin Location"`, `"Primary Driver"`)
  - `SourceTable NVARCHAR(256) NOT NULL`, `TargetTable NVARCHAR(256) NOT NULL`
  - `ColumnMappingsJson NVARCHAR(MAX) NOT NULL` (supports both single-column and composite column pairs: `[{"sourceColumn":"Loc_Id","targetColumn":"Location_Id"}]`)
  - `Cardinality NVARCHAR(16) NOT NULL DEFAULT 'N:1'` (`N:1` or `1:1`)
  - `IsActive BIT NOT NULL DEFAULT 1`
- **`dbo.Saved_Report_Templates`**:
  - `TemplateId INT IDENTITY(1,1) PRIMARY KEY`
  - `TemplateName NVARCHAR(256) NOT NULL`, `Description NVARCHAR(1000) NULL`, `Category NVARCHAR(128) NULL`
  - `AnchorTable NVARCHAR(256) NOT NULL`
  - `PageSettingsJson NVARCHAR(MAX) NOT NULL` (Page size, orientation, margins, watermark, repeating header/footer HTML)
  - `LayoutJson NVARCHAR(MAX) NOT NULL` (Rich document structure, inline merge tokens, repeater table metadata, footer aggregate definitions, field format rules)
  - `QueryMetadataJson NVARCHAR(MAX) NOT NULL` (`SelectedFields` with `TableAlias` & `RoleName`, ordered `JoinEdges`, `RepeaterQueries`, `FilterDefinitions`)
  - `CompiledSelectQuery NVARCHAR(MAX) NOT NULL` (Master `SELECT ... FROM [dbo].[Anchor] LEFT JOIN ...` statement)
  - `CompiledRepeaterQueriesJson NVARCHAR(MAX) NULL` (Map of `RepeaterId -> Parameterized Child SELECT Query`)
  - `IsActive BIT NOT NULL DEFAULT 1`, `CreatedAt DATETIME2`, `UpdatedAt DATETIME2`

#### 2. .NET Schema Introspection & Cardinality-Aware BFS Graph Service
`TMS_Lite_1_Oct_2026` exhibits specific relational complexities that a naive undirected graph cannot handle:
1. **404 tables & 5,993 columns**, with **151 tables lacking physical FKs** (bridged via `Report_Custom_Relationships`).
2. **14 Composite Foreign Keys**: Multi-column joins in `sys.foreign_key_columns` (grouped by `constraint_object_id`, ordered by `constraint_column_id`) must emit multi-predicate `ON` clauses (`A.[Col1] = B.[Col1] AND A.[Col2] = B.[Col2]`).
3. **14 Multi-FK Role-Playing Table Pairs**: E.g., `CL_Thc_Header` has **4 distinct FKs** to `CL_Master_Location`; `CL_Tripsheet_Header` has **2 FKs** to `CL_Master_Driver` and **2 FKs** to `CL_Master_Location`; `CL_Order_Header` has **2 FKs** to `CL_Master_Address`.
   - Each FK constraint is stored as a **distinct directed edge** in the adjacency multigraph (`EdgeId = ConstraintName`, `RoleLabel` derived from FK column name such as `From_Location_Id` → `"From Location"` or overridden in catalog).
   - When a user drops a field from `CL_Master_Location` onto a document anchored on `CL_Thc_Header`, the frontend checks the edge list returned by the Graph Service, detects multiple candidate paths, and displays the **Role Disambiguation Modal** (`Origin Location`, `Destination Location`, `Current Location`, `Controlling Location`). Each chosen role receives a deterministic SQL alias (`[CL_Master_Location__From_Location_Id]`).
4. **5 Self-Referencing Foreign Keys**: E.g., parent/child hierarchy within the same table. Handled by treating self-edges as directed `N:1` edges with distinct role aliases (`[Table__Parent]`) and bounding self-traversal depth to `1` hop unless explicitly requested.
5. **Cardinality-Aware BFS (Chasm-Trap & Fan-Trap Prevention)**:
   - Every FK defines two directed edges:
     - **Upward (`N:1` / `1:1`)**: From FK source table (Child) to PK referenced table (Parent/Master), e.g., `CL_Tripsheet_Header -> CL_Master_Location`.
     - **Downward (`1:N`)**: From PK referenced table (Parent) to FK source table (Child detail), e.g., `CL_Tripsheet_Header -> CL_Tripsheet_Advance_Detail`.
   - **Rule A (No `N -> 1 <- N` Chasm Trap through Master Tables)**: Once a path steps **upward (`N:1`)** into a shared master/lookup table (like `CL_Master_Location`), the BFS **forbids stepping downward (`1:N`)** into another unrelated transaction table (like `CL_Order_Header` or `CL_Docket_Header`). Transitioning `N:1` → `1:N` is strictly blocked. Allowed transitions are:
     - **Master Context (Scalar fields)**: `Anchor` (`1`) $\rightarrow$ `N:1` $\rightarrow$ `N:1` ... (any number of upward master lookups).
     - **Repeater Context (`<tr data-repeater="true">`)**: `Anchor` (`1`) $\rightarrow$ single `1:N` hop into Child Detail table $\rightarrow$ any number of upward `N:1` lookups from that Child Detail table (e.g., Line Item $\rightarrow$ Item Master).

#### 3. .NET Dynamic T-SQL Compiler & Parameterized Execution Engine
- **Identifier Validation & Bracket-Quoting**: Every schema, table, column, and generated alias is verified against the in-memory cached `SchemaGraphSnapshot` before compilation and emitted with strict SQL Server bracket-quoting (`[dbo].[CL_Tripsheet_Header].[Tripsheet_No]`). Raw user strings are never interpolated into SQL structure.
- **Master + Independent Repeater Query Splitting**:
  - A document anchored on `CL_Tripsheet_Header` with scalar fields from `CL_Master_Location` (Origin & Destination) and **two** repeating tables (`CL_Tripsheet_Vehicle_Detail` and `CL_Tripsheet_Advance_Detail`) compiles into:
    1. **Master Query**: Fetches Anchor PK (`__AnchorPK`) + all scalar fields using `LEFT JOIN` along `N:1` edges with role aliases, filtered by `@Param0, @Param1...`.
    2. **Repeater Query #1 (`CL_Tripsheet_Vehicle_Detail`)**: Fetches child rows + child's `N:1` lookups where `Child.[Tripsheet_Id] IN (@ak0, @ak1, ...)` (the Anchor PKs returned by the Master Query).
    3. **Repeater Query #2 (`CL_Tripsheet_Advance_Detail`)**: Fetches child rows where `Child.[Tripsheet_Id] IN (@ak0, @ak1, ...)`.
  - This guarantees $O(N + M_1 + M_2)$ row complexity instead of $O(N \times M_1 \times M_2)$ Cartesian blowup.
- **Safe Parameter Expansion**:
  - Scalar operators (`=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`): Single `SqlParameter` (`@p0`).
  - `BETWEEN`: Expands to `([Alias].[Col] >= @p0_start AND [Alias].[Col] <= @p0_end)`.
  - `IN`: Expands a multi-select array into `([Alias].[Col] IN (@p0_0, @p0_1, @p0_2))` with individual `SqlParameter` instances (or `STRING_SPLIT(@p0_csv, ',')` when parameter count > 100).
- **Dynamic Filter Lookups**:
  - `GET /api/reports/lookup/{fieldId}?search=DEL` executes:
    ```sql
    SELECT DISTINCT TOP (500) CAST([dbo].[Table].[Col] AS NVARCHAR(256)) AS [Value]
    FROM [dbo].[Table] WITH (NOLOCK)
    WHERE [dbo].[Table].[Col] IS NOT NULL
      AND (@search IS NULL OR CAST([dbo].[Table].[Col] AS NVARCHAR(256)) LIKE @searchPattern)
    ORDER BY [Value] ASC;
    ```

#### 4. .NET Document Merge & PDF/DOCX Export Service
- **Data Stitching & Grouping**:
  - Groups Master result rows by `__AnchorPK`.
  - Attaches each Repeater dataset's rows to its parent `__AnchorPK` via an in-memory `ILookup<object, IDictionary<string, object>>`.
  - **Single/Batch Document Mode**: Each distinct `__AnchorPK` produces one full rendered document instance separated by `<div class="page-break"></div>` (HTML/PDF) or `w:br w:type="page"` (OpenXML `.docx`).
  - **Summary List Mode**: Renders the master dataset as a continuous tabular report across pages with grand totals at the bottom.
- **Aggregations & Inline Formatting**:
  - Evaluates `SUM`, `COUNT`, `AVG`, `MIN`, `MAX` over numeric/row sets per repeater table (or grand summary) and injects formatted values into `<td data-aggregate="SUM" data-field="...">`.
  - Applies field formatters using `CultureInfo("en-IN")` for Indian Rupee (`₹ #,##0.00`), custom date masks (`dd-MM-yyyy`, `dd MMM yyyy`), text casing (`UPPER`, `lower`, `Title Case`), and Null fallback strings (`"N/A"`, `"0.00"`).
- **Export Pipelines**:
  - **PDF**: Uses **QuestPDF** / **Playwright Chromium Headless PDF** (or PuppeteerSharp) to guarantee 100% CSS Paged Media fidelity (matching the exact WYSIWYG DOM layout, CSS watermarks, custom fonts, and `Page X of Y` running headers/footers).
  - **DOCX**: Uses **DocumentFormat.OpenXml** (with HtmlToOpenXml / structured AST-to-OpenXML mapper) to generate native Word `SectionProperties` (page size, margins, orientation), `HeaderPart` / `FooterPart` (`PAGE` and `NUMPAGES` Word fields), native Word `Table` nodes with repeating `TableHeader`, and inline `Run` nodes.

---

## Recommended Project Structure

```
TMS REPORT DESIGNER/
├── backend/
│   └── TmsReportDesigner.Api/
│       ├── Controllers/
│       │   ├── CatalogController.cs           # Module 1: Dictionary & Virtual FKs
│       │   ├── SchemaGraphController.cs       # BFS Reachability & Role-Playing FK edges
│       │   ├── TemplatesController.cs         # Module 3: Save/Load/Validate Templates
│       │   └── ReportExecutionController.cs   # Module 4: Run, Lookup TOP 500, PDF, DOCX
│       ├── Data/
│       │   ├── SqlConnectionFactory.cs        # ADO.NET / Dapper connection management
│       │   └── Migrations/
│       │       └── 001_InitReportTables.sql   # DDL for Catalog, Custom_Relationships, Templates
│       ├── Models/
│       │   ├── Catalog/                       # FieldCatalogEntry, VirtualRelationshipDto
│       │   ├── Graph/                         # SchemaNode, ForeignKeyEdge, ReachabilityResult
│       │   ├── Templates/                     # ReportTemplateDto, QueryMetadata, FilterConfig
│       │   └── Execution/                     # ReportRunRequest, MergedDocumentPayload
│       ├── Services/
│       │   ├── Schema/
│       │   │   ├── SchemaIntrospectionService.cs    # Reads INFORMATION_SCHEMA + sys.foreign_keys
│       │   │   └── RelationshipGraphService.cs      # Cardinality-Aware BFS & Role Aliasing
│       │   ├── Compiler/
│       │   │   ├── DynamicSqlCompiler.cs            # Master + 1:N Repeater SQL Generator
│       │   │   └── SqlIdentifierValidator.cs        # Whitelist + [dbo].[Table].[Col] quoting
│       │   ├── Execution/
│       │   │   ├── ReportExecutionService.cs        # Parameterized ADO.NET runner & PK grouping
│       │   │   └── FilterLookupService.cs           # SELECT DISTINCT TOP 500 lookup service
│       │   └── Export/
│       │       ├── DocumentMergeEngine.cs           # Token replacement, Repeaters, Aggregates
│       │       ├── PdfExportService.cs              # Paginated PDF rendering
│       │       └── DocxExportService.cs             # OpenXML (.docx) generation
│       ├── Program.cs
│       └── appsettings.json
└── frontend/
    └── src/
        └── app/
            ├── core/
            │   ├── models/                    # TypeScript interfaces matching .NET DTOs
            │   └── services/
            │       ├── catalog-api.service.ts
            │       ├── schema-graph.service.ts
            │       ├── template-api.service.ts
            │       └── report-runner.service.ts
            ├── features/
            │   ├── manager-portal/            # Module 1 (/manager)
            │   │   ├── data-dictionary/       # CDK Virtual Scroll table for 5,993 columns
            │   │   └── virtual-relationships/ # Custom FK builder for 151 unlinked tables
            │   ├── report-designer/           # Module 2 & 3 (/designer, /designer/:id)
            │   │   ├── ribbon/                # 5-tab MS Word Ribbon (Home, Insert, Table, Layout, View)
            │   │   ├── canvas/                # Paginated WYSIWYG surface, Rulers, Watermarks, Repeaters
            │   │   ├── field-sidebar/         # Published fields tree + BFS reachability lock state
            │   │   ├── role-prompt-dialog/    # Disambiguation modal for 14 multi-FK pairs
            │   │   └── filter-builder-drawer/ # Module 2C runtime filter configurator
            │   └── report-runner/             # Module 4 (/reports/run/:templateId)
            │       ├── filter-bar/            # Dynamic inputs + TOP 500 lookup dropdowns
            │       ├── document-viewer/       # Paginated preview (Single/Batch vs Summary List)
            │       └── export-toolbar/        # Print, Download PDF, Download DOCX
            └── app.routes.ts
```

### Structure Rationale

- **Strict Feature Separation in Angular (`manager-portal`, `report-designer`, `report-runner`)**: Matches the three distinct user personas (Data Steward/Manager, Template Author, Operational End-User) and allows `/reports/run/:templateId` to load lightweight execution bundles when invoked via URL parameters from external TMS screens.
- **Dedicated `Schema/`, `Compiler/`, `Execution/`, and `Export/` Backend Namespaces**: Keeps graph algorithms (`RelationshipGraphService`), SQL compilation (`DynamicSqlCompiler`), database execution (`ReportExecutionService`), and document rendering (`DocumentMergeEngine`) independently testable with unit tests.

---

## Architectural Patterns

### Pattern 1: Cardinality-Aware Directed Multigraph BFS & Role Aliasing

**What:** Model the 404 tables and `341 physical + N virtual` foreign keys as a **directed multigraph** where every FK constraint generates:
1. An **`Upward (N:1)` edge** from Child (`parent_object_id`) to Parent (`referenced_object_id`).
2. A **`Downward (1:N)` edge** from Parent (`referenced_object_id`) to Child (`parent_object_id`).

During BFS from the selected `AnchorTable`, each queue state tracks `(CurrentTable, HasSteppedUpward)`.
- If `HasSteppedUpward == false`, BFS may traverse both `Downward (1:N)` (at most 1 hop for a repeater table) and `Upward (N:1)` edges.
- Once `HasSteppedUpward == true` (we entered a master lookup table like `CL_Master_Location`), BFS **only** traverses `Upward (N:1)` edges. It never traverses `Downward (1:N)` edges out of a master table.

**When to use:** On every field selection/removal in the Designer to compute reachable tables and lock unreachable tables in real time.

**Trade-offs:**
- *Pros:* Completely eliminates accidental `N -> 1 <- N` chasm traps through shared master tables (`CL_Master_Location` has 45+ incoming FKs across the database) while preserving multi-hop master lookups (`LineItem -> OrderHeader -> CustomerMaster -> CityMaster`).
- *Cons:* Requires explicit state tracking `(Table, Phase)` during BFS rather than a flat `HashSet<string>` visited set.

**Example (C#):**
```csharp
public sealed record ForeignKeyEdge(
    string ConstraintName,
    string SourceTable,
    string TargetTable,
    string RoleLabel,
    bool IsComposite,
    IReadOnlyList<(string SourceColumn, string TargetColumn)> ColumnPairs,
    EdgeDirection Direction // UpwardNTo1 or Downward1ToN
);

public ReachabilityResult ComputeReachability(string anchorTable)
{
    // State: (TableName, Mode: 0 = Anchor, 1 = InsideChildRepeater, 2 = UpwardMasterLookup)
    var visited = new Dictionary<(string Table, int Mode), List<ForeignKeyEdge>>();
    var queue = new Queue<(string Table, int Mode, List<ForeignKeyEdge> Path)>();

    queue.Enqueue((anchorTable, 0, new List<ForeignKeyEdge>()));
    visited[(anchorTable, 0)] = new List<ForeignKeyEdge>();

    while (queue.Count > 0)
    {
        var (current, mode, path) = queue.Dequeue();
        foreach (var edge in _adjacencyList.GetValueOrDefault(current, EmptyEdges))
        {
            if (current == edge.TargetTable && path.Count(e => e.SourceTable == e.TargetTable) >= 1)
                continue; // Cap self-referencing FKs (5 in schema) to 1 hop

            if (edge.Direction == EdgeDirection.UpwardNTo1)
            {
                // Allowed from Anchor (0), Child Repeater (1), or Master Lookup (2)
                int nextMode = mode == 1 ? 1 : 2;
                var key = (edge.TargetTable, nextMode);
                if (!visited.ContainsKey(key))
                {
                    var nextPath = new List<ForeignKeyEdge>(path) { edge };
                    visited[key] = nextPath;
                    queue.Enqueue((edge.TargetTable, nextMode, nextPath));
                }
            }
            else if (edge.Direction == EdgeDirection.Downward1ToN && mode == 0)
            {
                // Allowed ONLY directly from Anchor (prevents N -> 1 <- N chasm trap)
                var key = (edge.TargetTable, 1);
                if (!visited.ContainsKey(key))
                {
                    var nextPath = new List<ForeignKeyEdge>(path) { edge };
                    visited[key] = nextPath;
                    queue.Enqueue((edge.TargetTable, 1, nextPath));
                }
            }
        }
    }
    return BuildReachabilityResult(anchorTable, visited);
}
```

---

### Pattern 2: Multi-Query Split Execution for Independent `1:N` Repeaters

**What:** Instead of compiling a single flat `SELECT` with multiple `1:N` `LEFT JOIN` clauses (which multiplies rows when a Tripsheet has 4 Vehicles and 6 Advances = 24 duplicate combinations and corrupts `SUM()` footer totals), the compiler splits the template into:
1. **One Master Query**: `AnchorTable` + all scalar `N:1` master joins (including role-aliased joins like `LEFT JOIN [dbo].[CL_Master_Location] AS [CL_Master_Location__From_Location_Id]`).
2. **K Repeater Queries**: One parameterized query per `<tr data-repeater="true" data-table="ChildTable">` block, joining the child table back to the Anchor PK via `WHERE [Child].[AnchorFkCol] IN (@ak0, @ak1, ...)` plus any `N:1` master lookups belonging to that child row.

**When to use:** Whenever a template contains one or more repeating detail tables.

**Example (Generated T-SQL):**
```sql
-- 1. Compiled Master Query (Anchor + Role-Aliased N:1 Lookups)
SELECT
    [T0].[Tripsheet_Id] AS [__AnchorPK],
    [T0].[Tripsheet_No] AS [CL_Tripsheet_Header__Tripsheet_No],
    [T1].[Location_Name] AS [CL_Master_Location__From_Location_Id__Location_Name],
    [T2].[Location_Name] AS [CL_Master_Location__To_Location_Id__Location_Name]
FROM [dbo].[CL_Tripsheet_Header] AS [T0]
LEFT JOIN [dbo].[CL_Master_Location] AS [T1]
    ON [T0].[From_Location_Id] = [T1].[Location_Id]
LEFT JOIN [dbo].[CL_Master_Location] AS [T2]
    ON [T0].[To_Location_Id] = [T2].[Location_Id]
WHERE [T0].[Tripsheet_Id] = @p0;

-- 2. Compiled Repeater Query #1 (Independent 1:N Child Table)
SELECT
    [R0].[Tripsheet_Id] AS [__ParentAnchorPK],
    [R0].[Advance_Date] AS [CL_Tripsheet_Advance_Detail__Advance_Date],
    [R0].[Advance_Amount] AS [CL_Tripsheet_Advance_Detail__Advance_Amount]
FROM [dbo].[CL_Tripsheet_Advance_Detail] AS [R0]
WHERE [R0].[Tripsheet_Id] IN (@ak0);
```

---

### Pattern 3: Dual-Mode Report Runner (Interactive Filter UI + Direct URL Parameter Execution)

**What:** The Angular Report Runner route (`/reports/run/:templateId`) inspects `ActivatedRoute.queryParamMap` on initialization:
- **Interactive Mode**: No query parameters (or `autoRun != true`). Renders the configured Filter Bar with dynamic `SELECT DISTINCT TOP 500` dropdowns, date-range pickers, and multi-select chips.
- **Direct URL Execution Mode**: URL parameters match configured filter `FieldId` / `ColumnName` / `ParameterKey` (e.g., `/reports/run/5?Tripsheet_Id=1042&autoRun=true` or `&export=pdf`). Automatically binds the URL values into the filter state, triggers `POST /api/reports/execute`, and renders the merged document (or triggers immediate PDF/DOCX stream).

---

## Explicit Data Flows

### Flow 1: Startup Schema Introspection & Manager Governance Flow

```
[SQL Server: INFORMATION_SCHEMA + sys.foreign_keys]
    │ (1) Introspect 404 tables, 5,993 cols, 341 FKs (14 composite, 14 multi-FK, 5 self-ref)
    ▼
[SchemaIntrospectionService] ──(2) Upsert missing columns with auto-humanized DisplayName──► [dbo.Report_Field_Catalog]
    │
    │ (3) Merge physical FKs + [dbo.Report_Custom_Relationships] (for 151 unlinked tables)
    ▼
[RelationshipGraphService (In-Memory Adjacency Multigraph Cache)]
    ▲
    │ (4) Manager edits DisplayName / IsPublished / Virtual FKs in Angular Manager Portal
[CatalogController] ──(5) Invalidate & Rebuild Graph Snapshot (< 50ms)
```

### Flow 2: Visual Template Design, Role Disambiguation & Query Compilation Flow

```
[Designer Canvas (/designer)]
    │ (1) User drags first field (e.g. CL_Tripsheet_Header.Tripsheet_No)
    ▼
[Anchor Table Locked = CL_Tripsheet_Header]
    │ (2) GET /api/schema-graph/reachability?anchor=CL_Tripsheet_Header
    ▼
[Sidebar Updates: Unreachable tables locked; Reachable N:1 and 1:N tables highlighted]
    │ (3) User drops CL_Master_Location.Location_Name onto canvas
    ▼
[Multi-FK Check: 2 FKs exist between CL_Tripsheet_Header and CL_Master_Location]
    │ (4) Role Prompt Modal: User selects "From Location (From_Location_Id)"
    ▼
[Canvas inserts token {{CL_Master_Location__From_Location_Id.Location_Name}}]
    │ (5) User clicks "Save Template" -> POST /api/templates
    ▼
[DynamicSqlCompiler]
    ├── Validates all identifiers against SchemaGraphSnapshot
    ├── Builds Master SELECT with bracket-quoted LEFT JOINs &composite ON clauses
    ├── Builds independent Child Repeater SELECT queries
    └── Persists LayoutJson, QueryMetadataJson, CompiledSelectQuery -> [dbo.Saved_Report_Templates]
```

### Flow 3: Report Runner Execution, Data Merge & PDF/DOCX Export Flow

```
[User opens /reports/run/5?Tripsheet_Id=1042&autoRun=true]
    │ (1) GET /api/templates/5/run-metadata (loads filter definitions & UIControlTypes)
    │ (2) Optional: GET /api/reports/lookup/{fieldId} -> SELECT DISTINCT TOP 500 for dropdowns
    │ (3) POST /api/reports/5/execute { filterValues: { "Tripsheet_Id": 1042 }, mode: "BatchDocument" }
    ▼
[ReportExecutionService]
    ├── Binds SqlParameters (@p0, expands IN / BETWEEN safely)
    ├── Runs CompiledSelectQuery -> Master Rows (grouped by __AnchorPK)
    └── Runs CompiledRepeaterQueries with WHERE [ParentFK] IN (@ak0...) -> Child Rows per Repeater
    ▼
[DocumentMergeEngine]
    ├── For each AnchorPK group:
    │     ├── Clones Template DOM / AST
    │     ├── Replaces scalar {{Alias.Field}} tokens with formatted values (Date, ₹ Currency, Null fallback)
    │     ├── Expands each <tr data-repeater="true"> with matching child rows
    │     ├── Computes footer aggregates (SUM, COUNT, AVG, MIN, MAX)
    │     └── Resolves system tokens (Current Date/Time, Printed By, Page breaks)
    ▼
[Output Dispatcher]
    ├── JSON/HTML Preview -> Angular Paginated Document Viewer + Browser window.print()
    ├── PDF Stream        -> PdfExportService -> application/pdf download
    └── DOCX Stream       -> DocxExportService (OpenXML) -> application/vnd.openxmlformats... download
```

---

## Vertical MVP Build Order Across Phases

To deliver incremental, verifiable value while managing the complexity of a 404-table schema and an MS Word-class editor, the system must be built in **5 Vertical Phases**:

```
Phase 1: Database DDL, Schema Introspection & Cardinality-Aware FK Graph Engine
   │
   ▼
Phase 2: Module 1 — Manager Data Dictionary & Virtual Relationship Governance Portal
   │
   ▼
Phase 3: Module 2A — MS Word Ribbon & Paginated WYSIWYG Document Canvas
   │
   ▼
Phase 4: Modules 2B, 2C & 3 — Field Drag-and-Drop, Role Aliasing, Repeaters, Filters & Dynamic T-SQL Compiler
   │
   ▼
Phase 5: Module 4 — Dedicated Report Runner Page, URL Param Execution & PDF/DOCX Export Engine
```

| Phase | Vertical Slice Deliverable | Why This Order (Dependencies & Risk Mitigation) |
|-------|----------------------------|-------------------------------------------------|
| **Phase 1: Foundation, DDL & FK Graph Engine** | SQL DDL migration (`Report_Field_Catalog`, `Report_Custom_Relationships`, `Saved_Report_Templates`), `SchemaIntrospectionService` (404 tables, 5,993 cols, 341 FKs, 14 composite FKs, 14 multi-FK pairs, 5 self-ref FKs), and `RelationshipGraphService` (Cardinality-Aware BFS + Chasm-Trap protection). | Every downstream module depends on accurate schema metadata and reachability math. Verifying the 404-table graph and 14 multi-FK pairs against `TMS_Lite_1_Oct_2026` first eliminates schema surprises. |
| **Phase 2: Module 1 — Manager Data Dictionary Portal** | Angular Manager Portal (`/manager/dictionary` & `/manager/relationships`) with CDK Virtual Scroll over 5,993 columns, search/category filters, bulk publish, alias editing, and Virtual FK creation for the 151 unlinked tables. | The Report Designer sidebar only displays **published** fields and relies on **Virtual FKs** to reach unlinked tables. Building Module 1 second lets managers/testers publish real TMS tables immediately. |
| **Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Canvas** | 5-tab MS Word Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`), ruler-equipped paginated canvas, A4/Letter/Landscape setup, margins, watermarks, headers/footers, NxM tables, images, shapes, find/replace, and format painter. | Establishes the core document DOM/JSON contract (`LayoutJson` + `PageSettingsJson`) before binding live database tokens and repeaters into it. |
| **Phase 4: Modules 2B, 2C & 3 — Data Binding, Repeaters, Filters & T-SQL Compiler** | Reachability-locked field sidebar, Role Disambiguation modal on field drop, inline `{{Alias.Field}}` chips, multiple independent `<tr data-repeater="true">` tables, footer aggregates (`SUM/COUNT/AVG/MIN/MAX`), right-click field formatting, Runtime Filter Builder, and `DynamicSqlCompiler` persisting to `Saved_Report_Templates`. | Connects the Phase 1 Graph Service and Phase 2 Catalog to the Phase 3 Canvas, culminating in verified, bracket-quoted, parameterized T-SQL generation stored in `Saved_Report_Templates`. |
| **Phase 5: Module 4 — Separate Report Runner & PDF/DOCX Export Engine** | Dedicated `/reports/run/:templateId` page, dynamic `SELECT DISTINCT TOP 500` filter lookups, direct URL parameter execution (`?Tripsheet_Id=1042&autoRun=true`), Single/Batch Document Mode (Anchor PK grouping with page breaks) vs. Summary List Mode, Browser Print Preview, PDF export, and native Word `.docx` export. | Completes the end-to-end user journey and enables external TMS transaction screens to generate operational documents via URL. |

---

## Scaling Considerations

| Scale / Dimension | Bottleneck | Architectural Solution Built In |
|-------------------|------------|---------------------------------|
| **5,993 Columns in Manager UI** | Rendering 6,000 DOM rows freezes browser layout (> 2.5s TBT). | **Angular CDK Virtual Scroll (`cdk-virtual-scroll-viewport`)** + server-side/in-memory indexed filtering by table/category so only ~25 DOM rows exist at any instant. |
| **404 Tables / 341+ FKs Graph Traversal** | Querying `sys.foreign_keys` on every drag-and-drop would add 150ms+ DB latency per action. | **Singleton In-Memory Adjacency Multigraph Snapshot** (`IMemoryCache`) warmed at startup and invalidated only when a Manager updates `Report_Custom_Relationships` (< 2ms BFS execution). |
| **High-Cardinality `varchar` Filter Dropdowns** | Tables like `CL_Docket_Header` or `CL_Tripsheet_Header` may hold 100k+ rows. | **Strict `SELECT DISTINCT TOP (500)`** with debounced server-side `@searchPattern` prefix/substring filtering (`300ms` debounce in Angular). |
| **Batch Document Generation (e.g., 100 Tripsheets)** | N+1 query problem if child repeaters run once per Anchor row. | **Batched `WHERE [Child].[FkCol] IN (@ak0, @ak1, ...)`** repeater execution fetches all child rows for the batch in a single round-trip per repeater table, then stitches in memory via `ILookup`. |

---

## Domain Anti-Patterns to Avoid

### Anti-Pattern 1: Undirected BFS Across Foreign Keys (The Chasm Trap)
- **What people do:** Treat every FK as an undirected edge (`A <-> B`) during BFS reachability.
- **Why it's wrong:** In `TMS_Lite_1_Oct_2026`, `CL_Master_Location` is referenced by 45+ operational tables (`CL_Tripsheet_Header`, `CL_Thc_Header`, `CL_Order_Header`, `CL_Docket_Header`). Undirected BFS hops `CL_Tripsheet_Header -> CL_Master_Location -> CL_Order_Header`, joining unrelated orders that happen to share the same origin city (`N -> 1 <- N` chasm trap).
- **Do this instead:** Enforce **Cardinality-Aware Directed BFS** (Pattern 1): once traversal steps upward (`N:1`) into a parent/master table, forbid stepping downward (`1:N`) into other child tables.

### Anti-Pattern 2: Single Flat `LEFT JOIN` Query for Multiple `1:N` Repeaters (The Fan Trap)
- **What people do:** Join `Anchor` to `ChildTable1` (`1:N`) and `ChildTable2` (`1:M`) in a single SQL `SELECT`.
- **Why it's wrong:** Produces $N \times M$ duplicated rows per Anchor record, corrupting `SUM()` and `COUNT()` footer aggregations and repeating line items in the document.
- **Do this instead:** Compile **one Master Query** (`Anchor` + `N:1` lookups) and **one independent Repeater Query per `1:N` table** joined by `AnchorPK` in memory (Pattern 2).

### Anti-Pattern 3: Naive Table-Name Aliasing on Multi-FK Tables
- **What people do:** Alias joined tables solely by `TableName` (`LEFT JOIN [dbo].[CL_Master_Location] AS [CL_Master_Location]`).
- **Why it's wrong:** `TMS_Lite_1_Oct_2026` has 14 table pairs with multiple FKs between the exact same two tables (e.g., `CL_Thc_Header` has 4 FKs to `CL_Master_Location`). Joining the second role throws SQL error `The correlation name 'CL_Master_Location' is specified multiple times in a FROM clause`.
- **Do this instead:** Prompt for the FK Role on field drop and generate deterministic **Role-Scoped Aliases** (`[CL_Master_Location__From_Location_Id]` vs. `[CL_Master_Location__To_Location_Id]`).

### Anti-Pattern 4: Single-Column Assumption in Foreign Key Join Builder
- **What people do:** Assume every FK maps 1 source column to 1 target column (`ON A.FkCol = B.PkCol`).
- **Why it's wrong:** `TMS_Lite_1_Oct_2026` has **14 composite foreign keys** spanning multiple columns in `sys.foreign_key_columns`.
- **Do this instead:** Group `sys.foreign_key_columns` by `constraint_object_id` ordered by `constraint_column_id` and emit compound `ON` predicates joined by `AND`.

---

## Integration Points

### External & Host TMS Integration
| Integration Surface | Pattern | Example / Notes |
|---------------------|---------|-----------------|
| **TMS Transaction Screens → Report Runner** | Deep-link URL Navigation | `/reports/run/12?Tripsheet_Id=1042&autoRun=true` opens the pre-merged Tripsheet document directly from the TMS Tripsheet List screen. |
| **Direct Binary Document Export API** | Direct HTTP `GET` / `POST` stream | `GET /api/reports/12/export?format=pdf&Tripsheet_Id=1042` streams `application/pdf` or `.docx` directly for background printing or email attachment. |

### Internal Module Contracts
| Boundary | Contract Mechanism | Payload Highlights |
|----------|--------------------|--------------------|
| **Manager Portal ↔ Schema Graph** | `POST /api/catalog/publish`, `POST /api/catalog/relationships` | Updates SQL Server catalog tables and triggers `RelationshipGraphService.InvalidateCache()`. |
| **Designer ↔ Schema Graph** | `GET /api/schema-graph/reachability?anchor={table}` | Returns `ReachableTables`, `CandidateEdges` (with `IsMultiFkRolePromptRequired: true` when >1 edge exists), and `LockedTables`. |
| **Designer ↔ Template Compiler** | `POST /api/templates` | Sends `LayoutJson`, `PageSettingsJson`, and `QueryMetadataJson`; compiler validates against schema whitelist and persists `CompiledSelectQuery` + `CompiledRepeaterQueriesJson`. |
| **Report Runner ↔ Execution Engine** | `POST /api/reports/{id}/execute` | Sends runtime `FilterValues` and `ExecutionMode` (`BatchDocument` vs `SummaryList`); returns pre-grouped `MergedDocumentPayload` or binary PDF/DOCX stream. |

---
*Architecture research for: Dynamic Word-Like Report Designer & SQL Query Engine (`TMS_Lite_1_Oct_2026`)*
*Researched: 2026-11-13*
