# Phase 3: Module 2A — Complete MS Word Ribbon & Paginated Document Canvas - Context

**Gathered:** 2026-11-13
**Status:** Ready for execution

<domain>
## Phase Boundary

Deliver the complete **MS Word-like 5-Tab Ribbon UI & Paginated, Ruler-Equipped WYSIWYG Document Canvas** (`WORD-01`..`WORD-08`):
1. **Clipboard & History (`WORD-01`):** Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Cut, Copy, Paste (with formatting / plain text), Format Painter, and interactive Find & Replace dialog.
2. **Typography & Styles (`WORD-02`):** Font Family selector (`Arial`, `Calibri`, `Times New Roman`, `Roboto`, `Georgia`, `Courier New`, `Segoe UI`, `Verdana`), Font Size (`8pt` to `72pt`) + Increment/Decrement (`A^` / `Av`), Bold, Italic, Underline (`single`, `double`, `dotted`), Strikethrough, Subscript (`X₂`), Superscript (`X²`), Change Case (`UPPERCASE`, `lowercase`, `Title Case`, `Sentence case`), Text Color & Highlight Color pickers, Clear Formatting, and Quick Heading Styles gallery (`Normal`, `Title`, `Subtitle`, `Heading 1`..`Heading 6`, `Quote`).
3. **Paragraph & List Formatting (`WORD-03`):** Alignment (`Left`, `Center`, `Right`, `Justify`), Bulleted Lists (`disc`, `circle`, `square`), Numbered Lists (`1,2,3`, `a,b,c`, `i,ii,iii`), Nested Indentation (`Increase/Decrease Indent` + interactive horizontal ruler indent markers), Line Spacing (`1.0`, `1.15`, `1.5`, `2.0`, spacing before/after), Paragraph Borders & Shading.
4. **Insert Tab Elements (`WORD-04`, `WORD-05`):**
   - Interactive `NxM` Table Grid Selector + Custom Table dialog.
   - Images: Upload local image/logo (Base64), insert via URL, inline vs. floating wrap, alignment, and width/aspect-ratio resize controls.
   - Shapes & Dividers: Horizontal Rule (`<hr>`), Callout/Text Box (`div.word-callout`), Signature Block (`div.word-signature-line`).
   - Hyperlinks (`Insert/Edit Link`), Repeating Header & Footer regions (`headerHtml`, `footerHtml`), System Tokens (`{{SYSTEM.PageNumber}}`, `{{SYSTEM.TotalPages}}`, `{{SYSTEM.CurrentDate}}`, `{{SYSTEM.CurrentTime}}`, `{{SYSTEM.PrintedBy}}`), Explicit Page Break (`Ctrl+Enter`) & Section Break, and Special Characters (`₹`, `$`, `€`, `£`, `¥`, `©`, `®`, `™`, `±`, `≠`, `≤`, `≥`).
5. **Contextual Table Design & Layout Tools (`WORD-06`):** Appears automatically when cursor is inside a `<table>`: Insert Row Above/Below, Insert Column Left/Right, Delete Row/Column/Table, Merge Selected Cells, Split Cell, Cell Background Shading, Vertical Alignment (`Top`, `Middle`, `Bottom`), Cell Padding, Custom Border Styles (`All Borders`, `Outside Borders`, `No Border`, border width/color/style), Toggle **"Header Row Repeat"** (`data-repeat-header="true"`), and Toggle **"Repeating Data Row"** (`data-repeater="true"`).
6. **Layout Tab — Page Setup & Watermarks (`WORD-07`):** Page Size (`A4 210×297mm`, `Letter`, `Legal`, `A3`, `A5`, or Custom mm dimensions), Orientation (`Portrait` / `Landscape`), Margins (`Normal`, `Narrow`, `Moderate`, `Wide`, or Custom Top/Bottom/Left/Right mm), Multi-Column layout (`1`, `2`, `3` columns), and Diagonal/Horizontal Text or Image Watermark (`"DRAFT"`, `"CONFIDENTIAL"`, or logo URL/Base64).
7. **View Tab & Canvas Aids (`WORD-08`):** Zoom slider (`50%` to `200%`, `Fit to Page`, `Fit to Width`), Toggle Horizontal & Vertical Rulers (calibrated in mm/cm), Toggle Table Gridlines (dotted borders when cell borders are none), and Print Layout vs. Live SQL Preview toggle.

</domain>

