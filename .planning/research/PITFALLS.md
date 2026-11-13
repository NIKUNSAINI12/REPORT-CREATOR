# Pitfalls Research

**Domain:** Dynamic WYSIWYG Report Designer, Metadata-Driven T-SQL Query Compiler & Multi-Format Export Engine (`TMS_Lite_1_Oct_2026`)
**Researched:** 2026-11-13
**Confidence:** HIGH (Grounded directly in live `TMS_Lite_1_Oct_2026` schema audit and enterprise reporting engine architecture)

---

## Critical Pitfalls

### Pitfall 1: Role-Playing Foreign Key Ambiguity & Duplicate Table Alias Collision

**What goes wrong:**
When a user drops a field from a master lookup table (e.g., `CL_Master_Location.Location_Name` or `CL_Master_Driver.Driver_Name`) onto a template anchored to a transaction header (e.g., `CL_Thc_Header` or `CL_Tripsheet_Header`), a naive BFS pathfinder picks the first foreign key constraint it encounters in `sys.foreign_keys` and emits a standard table join without role disambiguation:
```sql
LEFT JOIN [dbo].[CL_Master_Location] ON [dbo].[CL_Thc_Header].[Origin_Location_Id] = [dbo].[CL_Master_Location].[Location_Id]
```
Two catastrophic failures occur:
1. **Silent Data Corruption:** If the user intended to display the *Destination Location* or *Current Location*, the query silently returns the *Origin Location* instead because BFS treats the graph as a simple graph rather than a multigraph.
2. **SQL Error 1013 (`The objects "dbo.CL_Master_Location" and "dbo.CL_Master_Location" in the FROM clause have the same exposed names`):** When the user drops *both* Origin Location Name and Destination Location Name into the same document, a compiler that keys joins by `TargetTableName` either overwrites the first join or emits two `LEFT JOIN [dbo].[CL_Master_Location]` clauses without unique role aliases.

**Why it happens:**
Developers frequently model schema graphs as `Dictionary<string, List<string>>` (mapping `TableA -> TableB`) rather than a **directed multigraph** where every edge is identified by its specific `FK_Constraint_Name` (or virtual relationship ID). In `TMS_Lite_1_Oct_2026`, **14 table pairs** have multiple FKs between the exact same two tables:
- `CL_Thc_Header` → `CL_Master_Location` has **4 FKs** (Origin, Destination, Current, Next/Via location roles).
- `CL_Tripsheet_Header` → `CL_Master_Driver` has **2 FKs** (Primary Driver vs. Secondary/Co-Driver).
- `CL_Tripsheet_Header` → `CL_Master_Location` has **2 FKs**.
- `CL_Order_Header` → `CL_Master_Address` has **2 FKs** (Billing vs. Shipping/Consignee address).

**How to avoid:**
1. **Multigraph Edge Representation:** Represent every edge in the FK graph using a composite edge descriptor (`ConstraintName`, `SourceTable`, `SourceColumns[]`, `TargetTable`, `TargetColumns[]`, `RoleLabel`, `IsVirtual`).
2. **Role-Disambiguation Prompt on Drop:** When a user drops a field from `TargetTable` and the shortest path from the active anchor/context tables contains a multigraph edge (or multiple equal-length paths), pause the drop action and open a lightweight **Role Selection Modal**: *"Which `CL_Master_Location` do you want to bind? (1) via `Origin_Location_Id`, (2) via `Destination_Location_Id`, (3) via `To_Bh_Location_Id`..."*
3. **Deterministic Role Aliasing in `QueryMetadataJson` & SQL:** Assign every joined table instance a deterministic alias derived from the FK role (e.g., `LEFT JOIN [dbo].[CL_Master_Location] AS [CL_Master_Location__Origin_Location_Id]`) and store the `RoleAlias` inside each `SelectedField` token (`{{CL_Master_Location__Origin_Location_Id.Location_Name}}`) and `FilterConfig` entry.

**Warning signs:**
- The `JoinPath` model in C# or TypeScript uses `TargetTable` as a unique key or `HashSet<string>` for visited tables.
- Dropping two fields from `CL_Master_Location` into a `CL_Thc_Header` template produces only one `LEFT JOIN` in the compiled SQL preview.
- Merge tags in the canvas only show `{{CL_Master_Location.Location_Name}}` with no visual indication of whether it represents Origin or Destination.

**Phase to address:**
- **Phase 1 (Schema Introspection & FK Graph Engine):** Multigraph data structures and edge-level metadata.
- **Phase 3 (WYSIWYG Designer, Drag-and-Drop & T-SQL Compiler):** Role-selection modal on drop and role-aliased SQL compilation.

---

### Pitfall 2: Undirected BFS Chasm/Fan Traps (`N -> 1 <- N`) & Multi-Repeater Cartesian Explosion (`1:N` × `1:M`)

**What goes wrong:**
Two distinct relational join pathologies destroy report accuracy and database server stability:
1. **Undirected BFS Chasm / Fan Trap (`N -> 1 <- N`):** Suppose a user starts a report on `CL_Docket_Header` (Consignment). An undirected BFS traverses `CL_Docket_Header` (`N`) → `CL_Master_Location` (`1`, Master Branch) ← `CL_Thc_Header` (`N`, Truck Hire Challan) or `CL_Tripsheet_Header` (`N`). Because both transaction tables link to the same master location table, an undirected BFS marks all 400+ tables connected to `CL_Master_Location` as "reachable!" Joining two unrelated transaction tables through a shared master lookup table produces a massive chasm trap—every Docket at Mumbai Branch is cross-joined with every Tripsheet at Mumbai Branch, generating millions of bogus rows and inflating `SUM()` totals by orders of magnitude.
2. **Multi-Repeater Cartesian Explosion (`1:N` × `1:M`):** A single operational document (e.g., a Tripsheet or Consignment Note) frequently requires **two or more independent repeating child tables** in the same template—such as *Item/Package Details* (`1:N`, say 15 rows) and *Advance/Expense Details* (`1:M`, say 8 rows). If the T-SQL compiler compiles the entire template into a single flat `SELECT ... FROM Header LEFT JOIN Packages LEFT JOIN Expenses`, each header produces `15 × 8 = 120` rows. Every package appears 8 times, every expense appears 15 times, and footer `SUM(Package_Weight)` is multiplied by 8×.

**Why it happens:**
- Treating foreign keys as undirected edges during BFS without tracking **cardinality transitions** (`N -> 1` lookup vs. `1 -> N` child expansion). Once a path steps *up* to a `1` parent/master table (`N -> 1`), stepping *down* into another `N` child table (`1 <- N`) creates a sibling fan-out (`N:M`).
- Assuming one report template equals one flat SQL query string.

**How to avoid:**
1. **Cardinality-Restricted BFS Reachability:**
   - Distinguish edge directions: **Outbound FK** (`Child.FK -> Parent.PK`, cardinality `N -> 1`) vs. **Inbound FK** (`Parent.PK <- Child.FK`, cardinality `1 -> N`).
   - From the Anchor Table, allow arbitrary chains of `N -> 1` (many-to-one master lookups, e.g., `Tripsheet -> Vehicle -> Vehicle_Type`).
   - Allow `1 -> N` traversal **only** directly from the Anchor Table (or along a strict `1 -> N` hierarchy descending from the Anchor) into a designated `<tr data-repeater="true">` context.
   - **Strictly forbid `N -> 1 <- N` transitions** in BFS: once traversal moves along an `N -> 1` edge into a master lookup table (`CL_Master_Location`, `CL_Master_Customer`, `CL_Master_User`), block all inbound `1 <- N` edges from that master table so sibling transaction tables are locked/unreachable.
2. **Split Query Execution or Keyed Deduplication for Multi-Repeaters:**
   - Associate each `<tr data-repeater="true">` table in the document with its own **Repeater Group / Child Table Context**.
   - During report execution, either:
     - **Option A (Preferred — Multi-Query Split):** Execute one **Header + `N:1` Master Lookup Query** (grouped/keyed by the Anchor Table Primary Key) and one separate parameterized **Child Repeater Query per `1:N` repeater table** (filtered by the Anchor PK batch `WHERE Anchor_PK IN (...)`), merging the datasets in memory by Anchor PK; OR
     - **Option B (Composite PK Deduplication):** If a single query is stored for preview, deduplicate header scalars by Anchor PK and deduplicate each repeater collection by its own Child Table Primary Key before rendering rows or computing `SUM`/`AVG`/`COUNT`.

**Warning signs:**
- Selecting `CL_Tripsheet_Header` leaves `CL_Docket_Header`, `CL_Invoice_Header`, and 200+ unrelated tables unlocked in the sidebar because they all reference `CL_Master_Location` or `CL_Master_Company`.
- Adding a second repeating table to a template causes the row count of the first repeating table to multiply or changes footer `SUM()` values.

**Phase to address:**
- **Phase 1 (Schema Introspection & FK Graph Engine):** Directed cardinality-aware BFS state machine (`N -> 1` vs `1 -> N` transition rules).
- **Phase 3 & Phase 4 (T-SQL Compiler & Report Runner Data Merger):** Repeater-scoped child query compilation and Anchor-PK/Child-PK deduplication prior to aggregation.

---

### Pitfall 3: Composite Foreign Keys (14), Self-Referencing Foreign Keys (5), and the 151 Unlinked Tables

**What goes wrong:**
1. **Composite FK Duplicate Join Expansion:** In `TMS_Lite_1_Oct_2026`, **14 foreign keys are composite** (spanning 2 or more columns in `sys.foreign_key_columns`). When developers query `sys.foreign_keys` joined to `sys.foreign_key_columns` without grouping by `constraint_object_id`, each column pair is treated as a separate FK constraint! The compiler then emits either a partial single-column `ON A.Col1 = B.Col1` (causing duplicate row fan-out) or two separate `LEFT JOIN` statements to the same table instead of `ON A.Col1 = B.Col1 AND A.Col2 = B.Col2`.
2. **Self-Referencing FK Infinite BFS Loops & Missing Self-Join Alias:** `TMS_Lite_1_Oct_2026` contains **5 self-referencing FKs** (e.g., hierarchical parent/child locations, account groups, or employee/manager hierarchies where `Parent_Id` references the same table's `Id`). Without cycle detection and explicit self-join aliasing, BFS enters an infinite loop or emits `LEFT JOIN [dbo].[TableA] ON [dbo].[TableA].[Parent_Id] = [dbo].[TableA].[Id]`, which is invalid T-SQL without an alias.
3. **151 Unlinked Tables Stranded or Broken by Bad Virtual FKs:** Out of 404 tables in `TMS_Lite_1_Oct_2026`, **151 tables have zero physical `sys.foreign_keys` constraints** (legacy TMS tables where joins are enforced only in application code/stored procedures). If the system relies solely on `sys.foreign_keys`, 37% of the database cannot be joined at all. Conversely, when Managers define custom links in `Report_Custom_Relationships`, if they link incompatible SQL data types (e.g., `varchar` to `int` where alphanumeric consignment numbers exist) or reverse the `1:N` direction, runtime queries crash with `Conversion failed when converting the varchar value '...' to data type int`.

**Why it happens:**
- Querying `sys.foreign_key_columns` row-by-row without aggregating multi-column keys (`parent_column_id`, `referenced_column_id` ordered by `constraint_column_id`) into a single edge with a `ColumnPairs` collection.
- Not validating custom relationships in the Manager Portal before saving to `Report_Custom_Relationships`.

**How to avoid:**
1. **Group Composite FKs by `constraint_object_id`:** When introspecting `sys.foreign_keys` and `sys.foreign_key_columns`, group by `fk.object_id` (`constraint_object_id`), ordering column pairs by `fkc.constraint_column_id`. Compile composite joins as:
   ```sql
   LEFT JOIN [dbo].[Target] AS [Alias]
     ON [Source].[Col1] = [Alias].[RefCol1]
    AND [Source].[Col2] = [Alias].[RefCol2]
   ```
2. **Self-Join Depth Cap & Mandatory Alias:** For self-referencing edges (`SourceTable == TargetTable`), cap automatic traversal depth (e.g., max 1 hop per explicit user selection) and force a role alias (`AS [TableName__Parent]`).
3. **Pre-Flight Validation on `Report_Custom_Relationships`:** In the Manager Data Dictionary Portal, when a manager creates a Virtual FK between two tables:
   - Validate that source and target column data types are join-compatible (e.g., integer-to-integer, string-to-string) using `INFORMATION_SCHEMA.COLUMNS`.
   - Require the manager to specify cardinality (`N:1 Lookup` vs. `1:N Detail`) or auto-detect it by checking if the target column is a Primary Key / Unique index.
   - Run a fast `SELECT TOP 1 1 FROM [Source] LEFT JOIN [Target] ON ...` dry-run check via the API before persisting the virtual relationship.

**Warning signs:**
- Your FK introspection query returns 355+ rows instead of **341 distinct FK constraints** on `TMS_Lite_1_Oct_2026`.
- Selecting a table with a self-referencing FK causes a stack overflow or failed SQL query with duplicate table names.
- Managers cannot join key operational tables (among the 151 unlinked tables) because no Virtual Relationship UI exists in Module 1.

**Phase to address:**
- **Phase 1 (DDL, Schema Introspection & FK Graph Service):** Composite FK aggregation, self-FK handling, and `Report_Custom_Relationships` merge.
- **Phase 2 (Module 1 — Manager Data Dictionary Portal):** Virtual FK builder with data-type compatibility validation and dry-run test.

---

### Pitfall 4: T-SQL Parameterization Edge Cases (`IN (@Param0)`, `BETWEEN`, `LIKE`, and Identifier Injection)

**What goes wrong:**
Dynamic SQL builders routinely fail on four T-SQL parameterization traps:
1. **`IN (@Param0)` Multi-Value Trap:** A developer compiles an `IN` filter as `WHERE [Status] IN (@Param0)` and binds `@Param0 = "Booked,InTransit,Delivered"` (or `"101,102,103"`). SQL Server does **not** split comma-separated strings inside `IN (@Param0)`:
   - For `varchar` columns, it searches for a single literal string `"Booked,InTransit,Delivered"`, returning **0 rows**.
   - For `int` / `bigint` columns, it throws `SqlException: Conversion failed when converting the varchar value '101,102,103' to data type int`.
2. **`BETWEEN` Dual-Parameter & End-of-Day `datetime` Trap:** `BETWEEN` requires two distinct parameters (`@Param0_Start AND @Param0_End`). Furthermore, when a user filters a `datetime` column (e.g., `Tripsheet_Date BETWEEN '2026-10-01' AND '2026-10-31'`), binding `'2026-10-31 00:00:00'` excludes every transaction recorded after midnight on October 31st!
3. **`LIKE` Wildcard Concatenation Trap:** Writing `WHERE [Docket_No] LIKE '%@Param0%'` treats `@Param0` as a literal string inside single quotes rather than a SQL parameter, or writing `LIKE '%' + @Param0 + '%'` without escaping literal `%`, `_`, and `[` characters in user input causes unexpected wildcard matches.
4. **Unvalidated / Unquoted Identifier SQL Injection:** Passing `TableName`, `ColumnName`, or `RoleAlias` from the frontend `QueryMetadataJson` directly into the SQL string without whitelisting against the live schema catalog and bracket-quoting (`QUOTENAME` / `[dbo].[Table].[Col]`) allows SQL injection via crafted JSON payloads or breaks on columns containing spaces/reserved T-SQL keywords (`Order`, `Date`, `Percent`, `User`, `From`, `To`).

**Why it happens:**
- Treating the compiled SQL template as a static string before knowing how many array items an `IN` filter will receive at runtime.
- Relying on frontend validation alone to trust table and column names in `QueryMetadataJson`.

**How to avoid:**
1. **Dynamic Parameter Expansion for `IN` at Execution Time:**
   - Store a structural placeholder in `CompiledSelectQuery` (or re-compile the `WHERE` clause from `QueryMetadataJson.FilterConfig` at execution time).
   - When an `IN` filter receives `N` values at runtime (from a multi-select dropdown or comma-separated URL query param like `?Tripsheet_Id=1041,1042,1043`), expand the SQL dynamically into `@Param0_0, @Param0_1, @Param0_2` and bind each element as a strongly-typed `SqlParameter` matching the column's SQL Server `SqlDbType` (or use `STRING_SPLIT(@Param0, ',')` with explicit `TRY_CAST` to the column's data type).
2. **`BETWEEN` Inclusive Date-Time Normalization:**
   - Bind two parameters (`@Param{i}_Min` and `@Param{i}_Max`).
   - When the column type is `datetime`, `datetime2`, or `smalldatetime` and the user supplies a date-only upper bound (`YYYY-MM-DD`), normalize `@Param{i}_Max` to `23:59:59.997` (or compile as `Col >= @Start AND Col < DATEADD(day, 1, @End)`).
3. **Optional Filter Short-Circuiting:**
   - When a filter has `IsRequired = false` and the user leaves it blank on the Report Runner page, cleanly omit that predicate from the runtime `WHERE` clause (or emit `(@Param0 IS NULL OR [Table].[Col] = @Param0)`)—taking care with `IN` and `BETWEEN` when empty.
4. **Strict Catalog Whitelist + `QUOTENAME` Equivalent:**
   - Every schema, table, and column identifier in `QueryMetadataJson` must be verified against the cached `INFORMATION_SCHEMA` dictionary before SQL generation.
   - Format all identifiers using safe bracket escaping (`[{identifier.Replace("]", "]]")}]`).

**Warning signs:**
- `CompiledSelectQuery` contains `IN (@Param0)` as a fixed string and the runner simply passes the raw string value into a single `SqlParameter`.
- Filtering a report for a single day (`2026-10-15` to `2026-10-15`) returns zero records because `00:00:00` to `00:00:00` misses daytime timestamps.
- A column named `Order` or `From` causes `Incorrect syntax near the keyword 'Order'`.

**Phase to address:**
- **Phase 3 (Module 2C & Module 3 — Filter Builder & Dynamic T-SQL Compiler):** Whitelisted bracket-quoting, typed parameter descriptors, and `IN`/`BETWEEN`/`LIKE` expansion logic.
- **Phase 4 (Module 4 — Report Runner & URL Param Execution):** Runtime array/URL parameter parsing and `SqlDbType` binding.

---

### Pitfall 5: Continuous DOM Editor vs. Paginated Print / PDF / DOCX Fidelity Drift

**What goes wrong:**
What the user sees on the Angular Report Designer canvas does not match what prints from the browser, downloads as a PDF, or opens in Microsoft Word (`.docx`):
1. **Endless Scroll vs. Discrete Page Boundaries:** If the WYSIWYG editor is built as a single continuous `contenteditable` `<div>` with CSS `min-height: 297mm`, content overflows page 1 without showing where page 2 begins, where headers/footers repeat, or where a table row will be sliced in half across a page boundary.
2. **Table Header (`<thead>`) & Row Splitting in Print/PDF:** When a repeating table (`<tr data-repeater="true">`) expands to 80 rows at runtime, it spans 3 pages. Without explicit `<thead>` + `display: table-header-group` and `tr { break-inside: avoid; page-break-inside: avoid; }`, page 2 and page 3 lose their column headers and text lines are cut horizontally across page breaks.
3. **CSS Screen vs. `@media print` & Headless PDF Stripping:** Browsers and PDF engines strip background colors, table header shading, and diagonal watermarks unless `-webkit-print-color-adjust: exact; print-color-adjust: exact;` is enforced, and `@page` margin rules override CSS container padding if not coordinated.
4. **HTML-to-DOCX Structural Mismatch:** Modern CSS constructs used in the browser canvas (`display: flex`, `display: grid`, CSS `transform: rotate(-45deg)` for watermarks, absolute-positioned callouts, or raw `px` widths exceeding page margins) are **ignored or mangled** by Microsoft Word and OpenXML converters (`HtmlToOpenXml` / `DocumentFormat.OpenXml`). Tables burst past the right margin in Word, watermarks disappear or render as normal paragraphs, and `Page X of Y` tokens render as static text `"Page 1 of 1"` on every page instead of native Word `PAGE` and `NUMPAGES` fields.

**Why it happens:**
- Treating HTML/CSS screen rendering, `@media print` / Chromium PDF rendering, and OpenXML `.docx` word-processing models as interchangeable without an explicit translation contract.
- Using CSS Flexbox/Grid for document layout instead of table/block/inline constructs that map cleanly to both print media and OpenXML (`w:tbl`, `w:p`, `w:r`, `w:sectPr`).

**How to avoid:**
1. **Explicit Page Geometry Model in `LayoutJson`:** Store page dimensions in physical units (`mm` / `twips`—where `1 mm ≈ 56.7 twips`, `A4 = 210mm × 297mm = 11906 × 16838 twips`) alongside margins, orientation, header/footer bands, and watermark definitions in `LayoutJson`.
2. **Enforce Print-Safe HTML Primitives in the Canvas:**
   - All data tables must emit semantic `<table>`, `<thead>`, `<tbody>`, and `<tfoot>` (for aggregations), with `table-layout: fixed` and percentage or `mm`/`pt` column widths that sum to `≤ 100%` of the printable content width.
   - Inject `@page` rules dynamically matching the template's saved Page Setup (A4/Letter/Legal, Portrait/Landscape, custom margins) and set `print-color-adjust: exact`.
   - In Batch Document Mode (multiple Consignments/Tripsheets in one run), wrap each anchor record's merged document in a `.report-document-instance` container with `break-after: page; page-break-after: always;` (except the last record) so every record starts cleanly on page 1 with its own header/footer and aggregations.
3. **Dedicated OpenXML (`.docx`) Translation Layer in .NET:**
   - Do **not** simply rename an HTML file to `.doc` (which triggers Word security/corruption warnings in modern Office 365).
   - Build a structured OpenXML exporter using `DocumentFormat.OpenXml` (and/or `HtmlToOpenXml` post-processed with native `SectionProperties`):
     - Map `PageSetup` directly to `w:pgSz` and `w:pgMar` in twips (`Landscape` requires both `Orient = PageOrientationValues.Landscape` AND swapping `Width` and `Height` in `w:pgSz`!).
     - Map repeating Headers and Footers to native OpenXML `HeaderPart` and `FooterPart`.
     - Translate system tokens `{{System.PageNumber}}` and `{{System.TotalPages}}` into native Word complex fields (`PAGE` and `NUMPAGES`) inside the DOCX header/footer so Word paginates them accurately.
     - Render diagonal text/image watermarks into the `HeaderPart` using VML/DrawingML shapes behind text (`behindDoc="1"`) so they appear on every page in Word.
     - Set `CantSplit` (`<w:cantSplit/>`) on table rows and `TblHeader` (`<w:tblHeader/>`) on `<thead>` rows so Word automatically repeats table headers across page breaks.

**Warning signs:**
- Landscape mode in DOCX export sets `Orient = Landscape` without swapping `Width` and `Height` on `PageSize`, which causes Microsoft Word to still display a narrow portrait page!
- `<thead>` is missing on repeating tables, so multi-page tables have no headers on page 2+.
- Batch execution of 10 Tripsheets runs them together on the same page instead of inserting a hard page break (`<w:br w:type="page"/>` in DOCX / `break-after: page` in PDF/Print) between each anchor record.

**Phase to address:**
- **Phase 2 (Module 2A — MS Word Ribbon & Paginated Canvas):** Semantic table/header/footer/page-setup DOM structure and physical unit geometry.
- **Phase 4 (Module 4 — Report Runner & PDF/DOCX Export Engine):** Print CSS, Chromium/QuestPDF or browser PDF pipeline, and native OpenXML `.docx` builder (`w:pgSz`, `w:tblHeader`, `PAGE`/`NUMPAGES` fields, per-record page breaks).

---

### Pitfall 6: DOM Freeze in Manager Portal & Designer Sidebar (404 Tables / 5,993 Columns)

**What goes wrong:**
`TMS_Lite_1_Oct_2026` contains **404 tables and 5,993 columns**. If the Manager Data Dictionary Portal (Module 1) or the Report Designer Field Sidebar (Module 2) renders all 5,993 columns simultaneously using a standard `*ngFor` / `@for` table or accordion tree:
- Each row has 5–8 interactive bindings (`ngModel` / `FormControl` for `DisplayName`, `CategoryName`, `IsPublished` toggle, `DataType` badge, FK indicator, drag handle).
- `5,993 rows × ~15 DOM nodes/directives = ~90,000 DOM nodes` and `~25,000 Angular bindings`.
- Opening the Manager Portal or typing a character into the search box triggers an Angular change detection sweep across 90,000 nodes, freezing the main browser thread for **3–8 seconds** per keystroke and crashing low-memory client tabs.

**Why it happens:**
- Fetching the entire 5,993-column catalog in a single unpaginated payload and binding it directly to a non-virtualized DOM table or rendering all 404 accordion bodies in the DOM at once (`[hidden]="!expanded"` instead of lazy `@if` / `*ngIf` + virtual scroll).
- Running BFS reachability recalculation synchronously on the main UI thread without memoization or indexed lookup maps, causing `O(V × E)` scans to iterate through 5,993 column DOM elements on every field drop.

**How to avoid:**
1. **Two-Tier / Lazy Table-First Architecture in Manager Portal:**
   - **Left/Master Pane (or Virtualized Table List):** Render the 404 tables with summary counts (`Published: 12 / 28 columns`, search filter, category filter, and `"Has Unlinked FK"` filter).
   - **Right/Detail Inspector (or `@angular/cdk/scrolling` `cdk-virtual-scroll-viewport`):** Only mount DOM rows for the currently inspected table's columns (~15–40 columns) OR use `cdk-virtual-scroll-viewport` with fixed `itemSize="44"` so at most ~25–30 row elements exist in the DOM at any instant regardless of whether all 5,993 columns are searched globally.
2. **Debounced Search + `ChangeDetectionStrategy.OnPush` + Angular Signals:**
   - Enforce `ChangeDetectionStrategy.OnPush` across all catalog table/tree components.
   - Debounce search inputs (`debounceTime(150)`, `distinctUntilChanged()`) and filter in memory using pre-indexed lowercase search strings (`searchKey = "${tableName} ${columnName} ${displayName}".toLowerCase()`).
   - Track column edits in a lightweight dirty `Map<number, CatalogPatch>` and save via a single batch `PUT /api/catalog/bulk` endpoint rather than firing 50 individual HTTP requests when clicking `"Publish All in Table"`.
3. **Designer Sidebar — Published-Only + Lazy Accordion Expansion:**
   - The Designer sidebar should only load **Published** fields (`IsPublished = 1`) grouped by Category/Table.
   - Render accordion children lazily (`@if (isExpanded(table.name))`) so collapsed tables have zero child DOM nodes.
   - Compute BFS reachability at the **table level** (`404` nodes, `< 1ms` in JS or .NET) using a `Set<string>` of reachable table names, and bind `[class.locked]="!reachableTables().has(table.name)"` at the table header and field item level in `O(1)` lookup time.

**Warning signs:**
- `document.querySelectorAll('*').length` exceeds `5,000` on the Manager Portal or Report Designer page.
- Typing in the search bar has visible input lag (>100ms per keystroke).
- Clicking `"Publish All"` on a table with 45 columns triggers 45 separate network requests in the DevTools Network tab.

**Phase to address:**
- **Phase 2 (Module 1 — Manager Data Dictionary Portal):** Virtualized/lazy master-detail table inspector, debounced Signal filtering, `OnPush`, and bulk save API.
- **Phase 3 (Module 2 — Report Designer Sidebar):** Lazy accordion rendering and `O(1)` table-set reachability binding.

---

## Technical Debt Patterns

Shortcuts that seem reasonable during early prototyping but create severe rework later.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| **Keying joins by `TableName` instead of `(ConstraintName, RoleAlias)`** | Simpler dictionary lookup in early SQL generator | Impossible to support `CL_Thc_Header` (4 location FKs) or `CL_Tripsheet_Header` (2 driver FKs); requires rewriting both `QueryMetadataJson` schema and SQL compiler | **Never** — must be edge/alias-keyed from Day 1 |
| **Executing one flat SQL query for templates with multiple `1:N` repeaters** | Single `SqlCommand` call in backend | Cartesian multiplication (`1:N` × `1:M`) corrupts row counts and `SUM`/`COUNT` totals whenever a user adds 2 detail tables | **Never** — must split child queries or deduplicate by Child PK |
| **Saving only rendered HTML instead of structured `LayoutJson` + `QueryMetadataJson`** | Fast initial save button implementation | Cannot re-hydrate Page Setup, Margins, Watermarks, Filter definitions, or Role Aliases when re-opening a template for editing | **Never** — always persist structured metadata alongside HTML/layout |
| **Exporting `.docx` by wrapping HTML in a MIME/MHT header or renaming `.html` to `.doc`** | Zero backend OpenXML code needed | Modern MS Word blocks or warns on renamed HTML files; page breaks, landscape orientation, watermarks, and `Page X of Y` tokens break | **Never** — use real OpenXML (`DocumentFormat.OpenXml`) |
| **Computing BFS reachability on the backend via HTTP roundtrip on every mouse hover** | Avoids sharing graph logic in TypeScript | Network latency (50–200ms) makes drag-and-drop feel sluggish | **Acceptable if** the FK graph JSON (404 nodes, 341+ edges, ~30KB) is fetched once on load and BFS runs instantaneously (<1ms) client-side, verified by backend on save |

---

## Integration Gotchas

Common mistakes when connecting Angular, ASP.NET Core, SQL Server (`TMS_Lite_1_Oct_2026`), and document exporters.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **SQL Server `sys.foreign_keys` Introspection** | Querying `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS` (which is slow and incomplete on SQL Server) or failing to group `sys.foreign_key_columns` by `constraint_object_id` | Query `sys.foreign_keys`, `sys.foreign_key_columns`, `sys.tables`, and `sys.columns` directly; group by `fk.object_id` ordered by `constraint_column_id` to preserve composite key order |
| **SQL Server Unlinked Legacy Tables (151 tables)** | Assuming all valid joins exist in `sys.foreign_keys` | Merge physical FKs with `dbo.Report_Custom_Relationships` at graph construction time so virtual FKs behave identically to physical FKs in BFS and SQL compilation |
| **Dynamic Lookup Dropdowns (`UIControlType = Dropdown / Multi-Select`)** | Running `SELECT DISTINCT [Col] FROM [HugeTransactionTable]` without row limits or null checks, locking large tables | Always compile lookup queries as `SELECT DISTINCT TOP 500 [Col] FROM [dbo].[Table] WITH (NOLOCK) WHERE [Col] IS NOT NULL ORDER BY [Col]` |
| **Direct URL Execution (`/reports/run/5?Tripsheet_Id=1042&autoRun=true`)** | Mapping URL query params by raw `ColumnName` only or failing when `FieldId` vs `ColumnName` vs `FilterLabel` is passed in the URL | Match URL query parameters case-insensitively against `ColumnName`, `FieldId`, `DisplayName`, and ` ParamName` defined in `FilterConfig` |
| **OpenXML Landscape Page Size** | Setting `PageOrientationValues.Landscape` on `PageSize` without swapping `Width` and `Height` attributes | In OpenXML (`w:pgSz`), Word requires `Width > Height` (e.g., `Width = 16838, Height = 11906` for A4 Landscape) *in addition* to `Orient = Landscape` |
| **Base64 / Uploaded Images in PDF & DOCX Export** | Storing `blob:http://localhost:4200/...` object URLs in `LayoutJson` when users insert logos/signatures | Convert uploaded images to Data URLs (`data:image/png;base64,...`) or persisted server asset URLs immediately upon insertion so `blob:` URLs don't expire across sessions or fail on the .NET backend |

---

## Performance Traps

Patterns that work on a 5-table toy schema but fail on `TMS_Lite_1_Oct_2026` (404 tables, 5,993 columns, and large operational tables).

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Unbounded Report Preview Execution** | Browser tab crashes with Out-Of-Memory (`Aw, Snap!`) when a user runs a report with no filter on a 500,000-row docket/tripsheet table | Enforce a configurable `TOP (@MaxRows)` cap (e.g., `TOP 500` in Interactive Preview, configurable batch limit for export) and display a clear warning banner when results are truncated | > 2,000 merged document pages in browser DOM |
| **Re-querying `INFORMATION_SCHEMA` & `sys.foreign_keys` on every API request** | 300–600ms overhead on every Designer or Portal call | Cache the introspected schema + FK graph in an `IMemoryCache` singleton in ASP.NET Core, invalidating only when `Report_Field_Catalog` or `Report_Custom_Relationships` is updated | Immediately under concurrent user load |
| **Rendering all 5,993 columns in Angular DOM** | 3–8 second freeze on page open and search input lag | Virtual scrolling (`cdk-virtual-scroll-viewport`) or table-first master-detail lazy loading + `OnPush` | > 500 rendered interactive form rows |
| **Unindexed / Unfiltered `SELECT DISTINCT` for Filter Dropdowns** | Filter panel takes 10+ seconds to load on Report Runner open | Limit dropdown auto-population to `SELECT DISTINCT TOP 500 ... WITH (NOLOCK)` and load filter option lists asynchronously per filter control | Tables with > 100,000 rows |

---

## Security Mistakes

Domain-specific security risks for a metadata-driven SQL compiler and document generator.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Trusting Table/Column Names in `QueryMetadataJson` from Client** | Attacker crafts a POST payload with `ColumnName: "1 FROM sys.sql_logins; --"` to exfiltrate credentials | Validate every `(SchemaName, TableName, ColumnName)` tuple against the server-side `IMemoryCache` schema dictionary and verify `IsPublished == true` before emitting `[Schema].[Table].[Column]` |
| **Trusting `CompiledSelectQuery` Sent from the Frontend** | If the frontend sends a SQL string to `/api/reports/execute`, any user can execute arbitrary SQL via DevTools | **Never execute raw SQL strings sent by the client.** The backend must compile (or re-verify) the `SELECT` statement server-side from validated `QueryMetadataJson` + catalog metadata |
| **String Interpolation in `IN` or `LIKE` Filters** | SQL injection via filter parameters (e.g., `?Tripsheet_No=1'%20OR%201=1--`) | Strictly bind every user filter value via `SqlCommand.Parameters.Add("@Param...", sqlDbType).Value = ...` |
| **SSRF via External Image URLs During Backend PDF/DOCX Generation** | User inserts an image URL pointing to `http://169.254.169.254/...` or internal intranet endpoints (`http://localhost:...`) that the .NET server fetches when building DOCX/PDF | Restrict server-side image fetching to `data:image/*;base64,...` URIs or validated `https://` allowlisted origins with private IP range blocking |
| **XSS via Unsanitized Database Strings in Merged HTML Preview** | A database field containing `<script>` or `<img onerror=...>` executes JavaScript when merged into `[innerHTML]` | HTML-encode all scalar database values and repeater cell values at merge time (`HtmlEncoder.Default.Encode` / Angular sanitization) while preserving template structural tags |

---

## UX Pitfalls

Common user experience mistakes in WYSIWYG report designers and enterprise data dictionaries.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **Silent Locking of Sidebar Fields Without Explanation** | Users get frustrated when 300+ tables grey out after dropping the first field and don't know *why* a table is locked | Show a helpful tooltip on locked tables: *"Locked: No relationship path from `CL_Tripsheet_Header` (or blocked to prevent duplicate `N:M` fan-out). Ask a Manager to add a Virtual Relationship if needed."* |
| **Cryptic FK Constraint Names in Role Prompt** | Showing `FK_CL_Thc_Header_CL_Master_Location_03` confuses business users | Humanize the FK role prompt using the source foreign key column's published `DisplayName` (e.g., **"Origin Location (`Origin_Location_Id`)"** vs. **"Destination Location (`Dest_Location_Id`)"**) |
| **Losing Cursor / Selection When Clicking Ribbon Buttons** | Clicking "Bold", "Font Color", or "Insert Merge Field" in the Ribbon steals focus from the canvas and inserts at the top of the document instead of the caret position | Use `mousedown` with `$event.preventDefault()` on Ribbon toolbar buttons (or persist/restore the active `Selection` `Range` object before executing canvas commands) |
| **Raw `{{Table.Column}}` Merge Tags Overflowing Narrow Table Cells** | Long merge tags like `{{CL_Master_Location__Origin_Location_Id.Location_Name}}` blow out narrow `20mm` table columns during design time | Render merge tags as compact, styled inline pills (`display: inline-flex; max-width: 100%; overflow: hidden; text-overflow: ellipsis;`) with a friendly badge (`📍 Origin Location: Location Name`) and `contenteditable="false"` so users can't accidentally backspace half a tag |
| **No Visual Distinction Between Single-Row Table and Repeating Data Table** | Users drop detail fields into a regular table row without marking `<tr data-repeater="true">` and wonder why only 1 row prints | Auto-enable (or prompt to enable) `data-repeater="true"` with a visible `🔁 Repeater Row` badge whenever a `1:N` child table field is dropped into a `<tr>` |

---

## "Looks Done But Isn't" Checklist

Critical verification items that look complete in a happy-path demo but fail in real TMS usage:

- [ ] **Role-Playing FKs (`CL_Thc_Header` → `CL_Master_Location`):** Verify dropping Origin Location Name AND Destination Location Name into the *same* template displays a role chooser, generates two distinct aliases (`AS [CL_Master_Location__Origin]`, `AS [CL_Master_Location__Dest]`), and renders two different city names in preview/PDF/DOCX.
- [ ] **Composite FKs (14 in `TMS_Lite_1_Oct_2026`):** Verify joining across any of the 14 composite FKs produces a single `LEFT JOIN ... ON A.Col1 = B.Col1 AND A.Col2 = B.Col2` rather than two separate `LEFT JOIN` clauses.
- [ ] **Chasm Trap Prevention (`N -> 1 <- N`):** Verify that dropping a field from `CL_Tripsheet_Header` allows reaching `CL_Master_Location` (`N -> 1`), but does **not** unlock `CL_Docket_Header` or `CL_Invoice_Header` through `CL_Master_Location`.
- [ ] **Multi-Repeater Independence (`1:N` × `1:M`):** Verify a template with two separate repeating tables (e.g., Table 1 with 5 rows, Table 2 with 3 rows) renders 5 rows in Table 1 and 3 rows in Table 2—not 15 rows in each—and footer `SUM()` is accurate.
- [ ] **Half-Broken Merge Tags:** Verify merge pills have `contenteditable="false"` so pressing Backspace deletes the entire field pill cleanly rather than leaving broken `{{Table.Col` text that fails regex parsing.
- [ ] **Batch Document Mode Page Breaks & Scoped Totals:** Verify running a template for 3 Tripsheet IDs (`IN (101, 102, 103)`) in Batch Document Mode produces 3 separate paginations with per-document `SUM()` totals and hard page breaks between documents.
- [ ] **DOCX Landscape & Watermarks:** Verify exporting a Landscape A4 template with a diagonal watermark to `.docx` opens in Microsoft Word in true Landscape (`Width > Height`) with the watermark behind the text and repeating table headers (`w:tblHeader`).
- [ ] **Direct URL Auto-Run (`/reports/run/5?Tripsheet_Id=1042&autoRun=true`):** Verify opening the URL directly bypasses manual clicking, binds `@Param0 = 1042`, and renders the merged document immediately.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover quickly without losing user templates.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Saved Templates Have Unaliased Role Joins** | MEDIUM | Run a migration utility over `Saved_Report_Templates.QueryMetadataJson` to inspect `SelectedFields`, backfill deterministic `RoleAlias` values from the first matching `FK_Constraint_Name`, and trigger server-side SQL recompilation |
| **Cartesian Explosion in Existing Multi-Repeater Templates** | LOW (Backend-only) | Because `QueryMetadataJson` stores `SelectedFields` and `JoinPath` declaratively, update the backend Report Execution Service to split `1:N` repeater queries or deduplicate rows by Child PK without requiring users to redesign their templates |
| **Broken Custom Virtual Relationship (Data Type Mismatch)** | LOW | Soft-disable the offending row in `Report_Custom_Relationships` (`IsActive = 0`), evict the `IMemoryCache` FK graph, and surface a validation error badge in the Manager Portal |
| **Corrupted / Unparseable `CompiledSelectQuery` String** | LOW | Always treat `QueryMetadataJson` as the source of truth and regenerate `CompiledSelectQuery` deterministically via the compiler service |

---

## Pitfall-to-Phase Mapping

How the project roadmap phases must address and verify each pitfall.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| **1. Role-Playing FK Ambiguity (14 multi-FK pairs)** | **Phase 1** (Graph Engine) & **Phase 3** (Designer Drop Modal + SQL Compiler) | Integration test with `CL_Thc_Header` + 2 `CL_Master_Location` roles verifying distinct aliases in SQL and merged output |
| **2a. Undirected BFS Chasm Traps (`N -> 1 <- N`)** | **Phase 1** (Cardinality-Aware BFS Service) | Unit test proving `CL_Docket_Header` is unreachable from `CL_Tripsheet_Header` via shared `CL_Master_Location` |
| **2b. Multi-Repeater Cartesian Explosion (`1:N` × `1:M`)** | **Phase 3** (Repeater Metadata) & **Phase 4** (Runner Execution/Merger) | End-to-end test with 2 child repeaters asserting exact row counts (`N` and `M`, not `N × M`) and exact `SUM()` footer totals |
| **3. Composite FKs (14), Self-FKs (5), Unlinked Tables (151)** | **Phase 1** (Introspection & Custom FK DDL) & **Phase 2** (Manager Portal Virtual FK Builder) | Schema audit test confirming 341 grouped FKs, `AND`-joined composite SQL, cycle-safe self-FKs, and working Virtual FK joins |
| **4. T-SQL Parameterization (`IN`, `BETWEEN`, `LIKE`, Quoting)** | **Phase 3** (T-SQL Compiler) & **Phase 4** (Report Runner Execution) | Security & query tests covering multi-value `IN (101, 102)`, end-of-day `BETWEEN`, empty optional filters, and bracket-quoted identifiers |
| **5. Continuous DOM vs. Print/PDF/DOCX Fidelity Drift** | **Phase 2** (Paginated Canvas & Ribbon) & **Phase 4** (PDF & OpenXML DOCX Exporter) | Visual & structural verification of A4/Landscape, `<thead>` repeat, watermarks, `PAGE`/`NUMPAGES` fields, and Batch Mode page breaks |
| **6. DOM Freeze on 404 Tables / 5,993 Columns** | **Phase 2** (Manager Data Dictionary Portal) & **Phase 3** (Designer Sidebar) | Performance check verifying `< 1,500` active DOM nodes, `< 50ms` search filter response, and single-request bulk publish |

---

## Sources

- **Live Database Schema Audit (`TMS_Lite_1_Oct_2026` on `localhost`):**
  - `INFORMATION_SCHEMA.TABLES` (`404` base tables) & `INFORMATION_SCHEMA.COLUMNS` (`5,993` columns).
  - `sys.foreign_keys` & `sys.foreign_key_columns` (`341` physical FKs across `253` linked tables; `151` unlinked tables; `14` composite FKs; `14` multi-FK role-playing table pairs including `CL_Thc_Header -> CL_Master_Location` [4 FKs] and `CL_Tripsheet_Header -> CL_Master_Driver` [2 FKs]; `5` self-referencing FKs).
- **Microsoft SQL Server & ADO.NET Documentation:**
  - Parameterized `IN` clause patterns, `QUOTENAME` identifier escaping, and composite foreign key metadata (`sys.foreign_key_columns.constraint_column_id`).
- **ECMA-376 OpenXML (`DocumentFormat.OpenXml`) Specification:**
  - `w:sectPr` (`w:pgSz` twips dimensions and mandatory width/height swap for `Landscape`), `w:tblHeader` repeating header rows, `w:cantSplit` row protection, `HeaderPart`/`FooterPart` VML watermark shapes, and `PAGE`/`NUMPAGES` simple/complex fields.
- **Angular CDK & W3C CSS Paged Media (`@page`, `break-inside`, `print-color-adjust`):**
  - `@angular/cdk/scrolling` virtual viewport optimization for multi-thousand-row data dictionaries and CSS print pagination standards.

---
*Pitfalls research for: Dynamic Word-Like Report Designer & SQL Query Engine (`TMS_Lite_1_Oct_2026`)*
*Researched: 2026-11-13*
