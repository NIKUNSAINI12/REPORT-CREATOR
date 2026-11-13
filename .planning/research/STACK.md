# Stack Research: Dynamic Word-Like Report Designer & SQL Query Engine

**Domain:** Enterprise WYSIWYG Paginated Report Designer, Foreign Key Graph SQL Compiler & Multi-Format Export Engine (`TMS_Lite_1_Oct_2026`)
**Researched:** 2026-11-13
**Confidence:** HIGH

---

## Recommended Stack

### Core Technologies (Frontend — Angular SPA)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Angular** | `19.x` (or `18.2.x` LTS) | Frontend SPA Framework, Signals-based reactive state, standalone components, and routing (`/manager`, `/designer/:id`, `/reports/run/:id`) | Angular 18/19 Signals (`signal()`, `computed()`, `effect()`) provide zero-overhead fine-grained reactivity when recalculating BFS foreign key reachability across 404 tables and 5,993 columns or synchronizing MS Word Ribbon state with cursor selection. |
| **TypeScript** | `5.6.x` | Strict static typing across AST nodes, schema graph edges, and SQL compiler contracts | Prevents runtime bugs in complex recursive structures (ProseMirror document AST, composite FK join paths, and multi-FK role aliases). |
| **TipTap + ProseMirror** (`@tiptap/core`, `prosemirror-model`, `prosemirror-view`, `prosemirror-state`, `prosemirror-tables`) | `2.10.x` / `1.x` | Headless, schema-driven rich-text and paginated document engine | Unlike `contenteditable` wrappers (`ngx-quill`, TinyMCE), TipTap/ProseMirror gives strict AST schema control. Custom atomic `MergeTag` nodes (`{{Table.DisplayName}}`), custom `RepeaterRow` table attributes (`<tr data-repeater="true" data-table="CL_Packages">`), and `SystemToken` nodes (`{{SYSTEM.PageNumber}}`) serialize deterministically to JSON (`LayoutJson`) and HTML. |
| **Angular CDK** (`@angular/cdk`) | `19.x` (matching Angular) | Virtual scrolling (`ScrollingModule`), drag-and-drop (`DragDropModule`), overlays (`OverlayModule`), and clipboard | `@angular/cdk/scrolling` (`cdk-virtual-scroll-viewport`) is mandatory to render 5,993 columns in the Manager Data Dictionary Portal at 60 FPS without DOM bloat. `@angular/cdk/drag-drop` powers dragging governed fields from the sidebar directly into the canvas or runtime filter dropzones. |
| **Tailwind CSS + Lucide Icons** (`tailwindcss`, `lucide-angular`) | `3.4.x` / `0.460.x` | MS Word Ribbon UI layout, contextual toolbars, ruler ticks, and high-density enterprise data grids | Enables pixel-precise recreation of the MS Word multi-tab Ribbon (`Home`, `Insert`, `Table Design/Layout`, `Layout`, `View`), contextual modals, and print-preview chrome without fighting opinionated component library styles. |

### Core Technologies (Backend — ASP.NET Core Web API)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **ASP.NET Core Web API** | `.NET 8.0 LTS` (`net8.0`, compatible with installed SDK `10.0.401` and runtime `8.0.31`) | REST API hosting for Schema Introspection, BFS Graph Engine, Dynamic T-SQL Compiler, Template CRUD, and Document Exports | Industry-standard enterprise backend with high-throughput JSON serialization (`System.Text.Json`), built-in DI for singleton/cached schema graphs, and native Windows/SQL Server integration. |
| **Microsoft.Data.SqlClient** | `5.2.x` | Official ADO.NET provider for SQL Server (`TMS_Lite_1_Oct_2026`) | Required for low-level `SqlCommand`, `SqlDataReader`, and strict `SqlParameter` (`@Param0`, `@Param1`) binding when executing dynamically compiled `LEFT JOIN` queries whose shape is unknown at compile time. |
| **Dapper** | `2.1.x` | Micro-ORM for high-speed metadata introspection and dynamic query materialization | Queries `INFORMATION_SCHEMA.TABLES` (404 tables), `INFORMATION_SCHEMA.COLUMNS` (5,993 columns), and `sys.foreign_keys` (341 FKs) in `<50ms`, and materializes dynamic report rows (`IEnumerable<IDictionary<string, object>>`) without Entity Framework DbContext compilation overhead. |

### Core Technologies (Document Export & Rendering Engine)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **PuppeteerSharp** (or **Microsoft.Playwright**) | `20.0.x` (`1.48.x`) | Headless Chromium HTML-to-PDF rendering engine with CSS `@page` and `@media print` fidelity | Since the Designer canvas is an HTML/CSS + ProseMirror WYSIWYG surface with custom fonts, Flexbox/Grid elements, diagonal/image watermarks, and multi-column sections, headless Chromium guarantees **100% pixel-identical WYSIWYG parity** between what the user designs on screen, Browser Print Preview, and the downloaded `.pdf` (including native `marginBoxes` / `headerTemplate` / `footerTemplate` for `Page X of Y`). |
| **DocumentFormat.OpenXml** | `3.1.x` | Official Microsoft OpenXML SDK for generating native Word (`.docx`) packages | Directly constructs and manipulates WordprocessingML (`w:sectPr`, `w:pgSz`, `w:pgMar`, `w:cols`, `w:hdr`, `w:ftr`, `w:tbl`, `w:tcBorders`, VML watermarks, and native `PAGE` / `NUMPAGES` fields) so exported `.docx` files open cleanly in desktop Microsoft Word with exact page geometry. |
| **HtmlToOpenXml** | `3.1.x` | Bridges merged ProseMirror HTML fragments into OpenXML WordprocessingML paragraphs, runs, lists, and tables | Converts the rich-text HTML body (bold, colors, inline styles, nested NxM tables, images, callouts) into `DocumentFormat.OpenXml` elements while allowing our custom post-processor to inject section page setup (`w:pgSz`, `w:pgMar`), repeating table headers (`w:tblHeader`), watermarks, and batch page breaks (`w:br w:type="page"`). |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tiptap/starter-kit` | `2.10.x` | Base ProseMirror extensions (Paragraph, Heading, Bold, Italic, Strike, BulletList, OrderedList, History) | Always — provides core Word `Home` tab typography and Undo/Redo stack. |
| `@tiptap/extension-table`, `-table-row`, `-table-cell`, `-table-header` | `2.10.x` | Resizable NxM tables, cell merging/splitting, background shading, custom border attributes, and repeater row attributes | Always — powers both static layout tables and dynamic `1:N` repeating data tables (`data-repeater="true"`). |
| `@tiptap/extension-text-style`, `-color`, `-highlight`, `-font-family`, `-text-align`, `-underline`, `-subscript`, `-superscript` | `2.10.x` | Inline styling marks required by the MS Word `Home` ribbon | Always — enables font family, point size, text/highlight color pickers, and paragraph alignment. |
| `@tiptap/extension-image`, `-link`, `-placeholder`, `-character-count` | `2.10.x` | Resizable images (Base64/URL), hyperlinks, and canvas placeholders | Always — supports `Insert` tab features (company logos, signature images, hyperlinks). |
| `ngx-color` or native HTML5 + custom swatch popover | `10.x` | Office-style theme color and standard color palette pickers | Use in Ribbon for Text Color, Highlight, Cell Shading, and Border Color. |
| `QuickGraph` / Custom C# `FkGraphService` | Built-in C# (`System.Collections.Generic`) | In-memory directed/undirected adjacency list for BFS pathfinding and chasm-trap detection | Use a custom C# service (`FkGraphService`) over external graph libraries—404 nodes and 341+ edges are traversed by a 60-line C# `Queue<T>` BFS in `<0.2ms` with full control over `N -> 1 <- N` cardinality rules and composite FK metadata. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Angular CLI** (`@angular/cli`) | `19.x` | Use `ng serve` with `proxy.conf.json` forwarding `/api/*` to the ASP.NET Core backend (`http://localhost:5000` or `https://localhost:7100`). |
| **.NET SDK CLI** (`dotnet`) | `10.0.401` (targeting `net8.0`) | Use `dotnet watch run` for hot-reload during API, BFS graph, and SQL compiler development. |
| **Swagger / Swashbuckle** (`Swashbuckle.AspNetCore`) | `6.8.x` | Interactive OpenAPI documentation and testing for `/api/manager/*`, `/api/designer/*`, and `/api/reports/*` endpoints. |

---

## Installation

### Frontend (`client/`)

```bash
# Initialize Angular workspace (Standalone, SCSS/Tailwind, Strict mode)
npx -p @angular/cli@19 ng new tms-report-designer-ui --standalone --routing --style=scss --strict

# Angular CDK for 6,000-column virtual scrolling, drag-and-drop, and overlays
npm install @angular/cdk@^19.0.0

# TipTap + ProseMirror core and MS Word Ribbon extensions
npm install @tiptap/core @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header \
  @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight \
  @tiptap/extension-font-family @tiptap/extension-text-align @tiptap/extension-underline \
  @tiptap/extension-subscript @tiptap/extension-superscript \
  @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder

# Icons & Styling
npm install lucide-angular
npm install -D tailwindcss postcss autoprefixer
```

### Backend (`server/TmsReportDesigner.Api/`)

```powershell
# Create ASP.NET Core Web API targeting net8.0
dotnet new webapi -n TmsReportDesigner.Api -f net8.0 --use-controllers

# High-speed SQL Server data access & dynamic query materialization
dotnet add package Microsoft.Data.SqlClient --version 5.2.2
dotnet add package Dapper --version 2.1.35

# Export Engine: DOCX (OpenXML + HTML bridge) and PDF (PuppeteerSharp)
dotnet add package DocumentFormat.OpenXml --version 3.1.1
dotnet add package HtmlToOpenXml --version 3.1.0
dotnet add package PuppeteerSharp --version 20.0.2
dotnet add package Swashbuckle.AspNetCore --version 6.8.1
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **TipTap / ProseMirror** (Custom AST Schema) | **Syncfusion DocumentEditor / TX Text Control / CKEditor 5** | Only if the organization has a paid enterprise license (`$1,000+/dev/yr`) and does not need custom FK-governed `MergeTag` and `RepeaterRow` AST nodes tightly bound to a custom SQL compiler. CKEditor 5's GPL/commercial licensing and rigid table model make custom repeater attributes harder to maintain than TipTap (MIT). |
| **Dapper + `Microsoft.Data.SqlClient`** | **Entity Framework Core (`Microsoft.EntityFrameworkCore.SqlServer`)** | Use EF Core only if building standard static CRUD over fixed entities. For a dynamic report engine that introspects 404 arbitrary tables, joins runtime-aliased tables (`[CL_Master_Location] AS [Origin_Location]`), and returns dynamic column projections, EF Core's static `DbContext` model cannot represent runtime-compiled projections cleanly. |
| **PuppeteerSharp (Headless Chromium)** + CSS `@media print` | **QuestPDF** or **iText7 / PdfSharp** | Use **QuestPDF** if generating rigid, code-defined invoices without an HTML/ProseMirror WYSIWYG designer. Because our users visually position arbitrary rich text, watermarks, callouts, and CSS-styled tables in an HTML/ProseMirror canvas, re-implementing an HTML/CSS layout parser in QuestPDF C# code causes visual drift between the Designer canvas and exported PDF. Note: Browser `window.print()` with `@media print` CSS serves as an instant zero-dependency fallback on the Runner page alongside backend PuppeteerSharp PDF streams. |
| **`DocumentFormat.OpenXml` + `HtmlToOpenXml`** | **Aspose.Words / GemBox.Document** | Only if budget allows expensive commercial per-server licenses. `DocumentFormat.OpenXml` (MIT, Microsoft official) + `HtmlToOpenXml` (MIT) covers 100% of page geometry (`w:pgSz`, `w:pgMar`), headers/footers, watermarks, and table borders with zero licensing cost. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`ngx-quill` / Quill.js** | Quill 1.x/2.x lacks full nested table cell merging, per-cell border styling, repeating header rows, and multi-page section geometry needed for an MS Word clone. | **TipTap 2 + ProseMirror** (`@tiptap/extension-table` + custom ProseMirror node views) |
| **Unvirtualized `*ngFor` / `@for` on 5,993 columns** | Rendering 5,993 column rows with toggle switches and inputs in the Manager Data Dictionary Portal creates `>30,000` DOM nodes, freezing the browser tab for 3–5 seconds on every keypress. | **`@angular/cdk/scrolling` (`cdk-virtual-scroll-viewport`)** + lazy table expansion / server-side search |
| **String interpolation for SQL filter values** (`WHERE Col = '${val}'`) | Opens critical SQL injection vulnerabilities and breaks on quotes, dates, and numeric formatting. | **Strict `SqlParameter` binding** (`@Param0`, `@Param1`) via `Microsoft.Data.SqlClient` / Dapper `DynamicParameters`, combined with whitelist validation of `[Schema].[Table].[Column]` against the cached schema catalog |
| **Single flat `LEFT JOIN` query for multiple `1:N` child tables** | Joining Anchor `CL_Tripsheet_Header` to both `1:N` `CL_Packages` (10 rows) and `1:M` `CL_Advance_Payments` (5 rows) in one SQL query produces `10 × 5 = 50` Cartesian product rows, corrupting `SUM()` aggregates and duplicating table rows. | **Multi-Query Execution Strategy**: 1 Header/Scalar query (`1:1` / `N:1` joins) + 1 separate parameterized child query per independent `1:N` Repeater Table, merged in memory by Anchor PK (`Tripsheet_Id`). |
| **Undirected Naive BFS across Master Lookup Tables** | Treating `CL_Master_Location` as an unrestricted bridge allows `CL_Order_Header -> CL_Master_Location <- CL_Tripsheet_Header`, creating a massive `N -> 1 <- N` chasm/fan trap between unrelated operational transactions. | **Cardinality-Aware BFS**: Permit `N -> 1` (outgoing FK from current table to lookup parent) and controlled `1 -> N` (incoming FK from child detail table to anchor), but **block `N -> 1 <- N` transitions** unless explicitly bridged via a governed relationship. |
| **`DocumentFormat.OpenXml` v2.x API patterns** | `DocumentFormat.OpenXml` v3.0+ removed obsolete `.Close()` methods and refactored package disposal patterns; mixing v2 snippets causes compile errors. | **`DocumentFormat.OpenXml` `3.1.x`** using standard `using var doc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document);` disposal. |

---

## Stack Patterns by Variant

**If rendering a Single or Batch Operational Document (e.g., Consignment Note, Tripsheet, Invoice):**
- Use **Anchor PK Grouping + Independent Child Repeater Queries** in the C# Report Execution Service.
- Because a single batch run (e.g., `Tripsheet_Date BETWEEN '2026-10-01' AND '2026-10-07'`) may return 25 Tripsheets, each with its own repeating rows and footer totals (`SUM`, `COUNT`), the engine groups the master rows by the Anchor Table's Primary Key, merges each record's child repeater rows, computes footer aggregates per document, and injects `<div class="page-break"></div>` (HTML/PDF) and `<w:br w:type="page"/>` (DOCX) between documents.

**If a table pair has multiple Foreign Keys (e.g., `CL_Thc_Header` -> `CL_Master_Location` has 4 FKs):**
- Use **Role-Disambiguated Table Aliases** in `QueryMetadataJson` and the T-SQL Compiler.
- Because joining `[CL_Master_Location]` twice without distinct role aliases causes duplicate table alias SQL errors (`The correlation name 'CL_Master_Location' is specified multiple times`), dropping a field from a multi-FK table triggers an Angular CDK modal prompting the user to select the specific FK constraint/role (e.g., *Origin Location* vs. *Destination Location*), assigning `[CL_Master_Location] AS [CL_Master_Location__Origin_Loc_Id]` and prefixing the merge tag accordingly.

**If exporting to PDF on Windows Server / Local Dev without external internet access:**
- Configure **PuppeteerSharp** to either reuse the locally installed Microsoft Edge / Chrome executable (`ExecutablePath` discovery) or cache the Chromium revision once at startup, with **CSS `@media print`** in the Angular Report Runner as a zero-latency client-side fallback.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@angular/core@19.x` | `@angular/cdk@19.x`, `typescript@~5.6.0`, `Node.js v24.11.1` | Major versions of `@angular/core`, `@angular/common`, `@angular/router`, and `@angular/cdk` must stay locked in sync. |
| `@tiptap/core@2.10.x` | `@tiptap/pm@2.10.x`, `@tiptap/extension-*@2.10.x` | Pin all `@tiptap/*` packages to the exact same minor/patch version to avoid duplicate `prosemirror-model` instances in the bundle. |
| `HtmlToOpenXml@3.1.0` | `DocumentFormat.OpenXml@3.1.1` | `HtmlToOpenXml 3.x` was specifically rewritten for `DocumentFormat.OpenXml 3.x` (`net8.0`). Do not mix `HtmlToOpenXml 2.x` with `OpenXml 3.x`. |
| `Microsoft.Data.SqlClient@5.2.x` | `Dapper@2.1.35`, `net8.0` | Requires `TrustServerCertificate=True;` in the connection string for local SQL Server (`Server=localhost;Database=TMS_Lite_1_Oct_2026;...`). |

---

## Sources

- **Local Environment Audit (`2026-11-13`)** — Verified installed `.NET SDK 10.0.401`, runtimes `Microsoft.AspNetCore.App 8.0.31` & `10.0.12`, `Node.js v24.11.1`, and `npm 11.6.2`.
- **Live SQL Server Schema Audit (`TMS_Lite_1_Oct_2026`)** — Verified `404` base tables, `5,993` columns, `341` physical FKs (`14` composite FKs, `14` multi-FK table pairs, `5` self-referencing FKs), and `151` unlinked tables requiring `Report_Custom_Relationships`.
- **TipTap 2 / ProseMirror Official Documentation** — Custom Node/Mark extensions, `Table` / `TableRow` / `TableCell` schema extension, and JSON/HTML serialization.
- **Microsoft OpenXML SDK (`DocumentFormat.OpenXml` v3.1) & `HtmlToOpenXml` v3.1 Documentation** — WordprocessingML section properties (`SectPr`), page dimensions (`PageSize`), margins (`PageMargin`), repeating header rows (`TableHeader`), and VML watermark generation.

---
*Stack research for: Dynamic Word-Like Report Designer & SQL Query Engine (`TMS_Lite_1_Oct_2026`)*
*Researched: 2026-11-13*
