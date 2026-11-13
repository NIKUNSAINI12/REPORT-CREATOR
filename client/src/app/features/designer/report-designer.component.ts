import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CatalogColumnDto,
  ManagerApiService
} from '../../core/services/manager-api.service';
import { ReportApiService } from '../../core/services/report-api.service';
import {
  JoinStepDto,
  LayoutDocumentDto,
  PageSetupDto,
  QueryMetadataDto,
  ReachabilityResult,
  RoleOptionDto,
  RuntimeFilterConfigDto,
  SavedReportTemplateDto,
  SelectedFieldDto,
  WatermarkDto
} from '../../core/models/report-template.models';

@Component({
  selector: 'app-report-designer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="designer-root" (click)="closeContextMenus()">
      <!-- Top Template Bar -->
      <div class="template-bar">
        <div class="template-meta">
          <select
            class="template-picker"
            [ngModel]="currentTemplateId()"
            (ngModelChange)="onSelectExistingTemplate($event)"
          >
            <option [ngValue]="null">+ New Blank Report Template</option>
            @for (tpl of savedTemplates(); track tpl.templateId) {
              <option [ngValue]="tpl.templateId">
                #{{ tpl.templateId }} — {{ tpl.templateName }} ({{ tpl.anchorTableName || 'Unbound' }})
              </option>
            }
          </select>

          <input
            type="text"
            class="template-name-input"
            [(ngModel)]="templateName"
            placeholder="Report Template Title..."
          />

          <select class="doc-mode-select" [(ngModel)]="documentMode">
            <option value="SingleOrBatchDocument">Mode: Single / Batch Document (1 Doc per Anchor PK)</option>
            <option value="SummaryList">Mode: Summary Register List (Continuous Table)</option>
          </select>
        </div>

        <div class="template-actions">
          @if (statusToast()) {
            <span class="save-toast">{{ statusToast() }}</span>
          }
          <button class="btn-sql-toggle" (click)="showSqlDrawer.set(!showSqlDrawer())">
            {{ showSqlDrawer() ? 'Hide SQL' : '⚡ View Auto-Compiled SQL' }}
          </button>
          <button class="btn-save" (click)="saveTemplate()" [disabled]="saving()">
            💾 {{ currentTemplateId() ? 'Update Template' : 'Save Template' }}
          </button>
          <button class="btn-run" (click)="saveAndRunReport()" [disabled]="saving()">
            ▶ Run &amp; Export Report
          </button>
        </div>
      </div>

      <!-- MS Word 5-Tab Ribbon -->
      <div class="word-ribbon">
        <div class="ribbon-tabs">
          <button [class.active]="ribbonTab() === 'home'" (click)="ribbonTab.set('home')">Home</button>
          <button [class.active]="ribbonTab() === 'insert'" (click)="ribbonTab.set('insert')">Insert</button>
          <button
            [class.active]="ribbonTab() === 'table'"
            [class.contextual-tab]="isCursorInTable()"
            (click)="ribbonTab.set('table')"
          >
            Table Design &amp; Layout {{ isCursorInTable() ? '●' : '' }}
          </button>
          <button [class.active]="ribbonTab() === 'layout'" (click)="ribbonTab.set('layout')">Layout (Page Setup)</button>
          <button [class.active]="ribbonTab() === 'view'" (click)="ribbonTab.set('view')">View</button>
        </div>

        <div class="ribbon-body">
          <!-- TAB 1: HOME (Clipboard, Typography, Styles, Paragraph & Lists) -->
          @if (ribbonTab() === 'home') {
            <div class="ribbon-group">
              <div class="group-controls">
                <button title="Undo (Ctrl+Z)" (click)="execCmd('undo')">↩ Undo</button>
                <button title="Redo (Ctrl+Y)" (click)="execCmd('redo')">↪ Redo</button>
                <button title="Cut" (click)="execCmd('cut')">✂ Cut</button>
                <button title="Copy" (click)="execCmd('copy')">📋 Copy</button>
                <button title="Paste Plain Text" (click)="pastePlainText()">📄 Paste</button>
                <button
                  title="Format Painter"
                  [class.active-tool]="formatPainterActive()"
                  (click)="toggleFormatPainter()"
                >
                  🖌 Painter
                </button>
                <button title="Find & Replace" (click)="showFindReplace.set(!showFindReplace())">
                  🔍 Find
                </button>
              </div>
              <div class="group-label">Clipboard &amp; History</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <select [ngModel]="selectedFontFamily" (ngModelChange)="applyFontFamily($event)" title="Font Family">
                  @for (f of fontFamilies; track f) {
                    <option [value]="f">{{ f }}</option>
                  }
                </select>
                <select [ngModel]="selectedFontSizePt" (ngModelChange)="applyFontSizePt($event)" title="Font Size (pt)">
                  @for (sz of fontSizesPt; track sz) {
                    <option [ngValue]="sz">{{ sz }} pt</option>
                  }
                </select>
                <button title="Increase Font Size" (click)="stepFontSize(2)">A▲</button>
                <button title="Decrease Font Size" (click)="stepFontSize(-2)">A▼</button>
                <button title="Bold (Ctrl+B)" (click)="execCmd('bold')"><b>B</b></button>
                <button title="Italic (Ctrl+I)" (click)="execCmd('italic')"><i>I</i></button>
                <select (change)="applyUnderlineStyle($any($event.target).value)" title="Underline Style">
                  <option value="">U (Underline)</option>
                  <option value="single">Single Underline</option>
                  <option value="double">Double Underline</option>
                  <option value="dotted">Dotted Underline</option>
                </select>
                <button title="Strikethrough" (click)="execCmd('strikeThrough')"><s>ab</s></button>
                <button title="Subscript" (click)="execCmd('subscript')">X₂</button>
                <button title="Superscript" (click)="execCmd('superscript')">X²</button>
                <select (change)="changeSelectedCase($any($event.target).value); $any($event.target).value=''" title="Change Case">
                  <option value="">Aa Case</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                  <option value="title">Title Case</option>
                  <option value="sentence">Sentence case</option>
                </select>
                <label class="color-picker-btn" title="Font Text Color">
                  A🎨
                  <input type="color" [ngModel]="textColor" (ngModelChange)="applyTextColor($event)" />
                </label>
                <label class="color-picker-btn" title="Text Highlight Color">
                  🖍
                  <input type="color" [ngModel]="highlightColor" (ngModelChange)="applyHighlightColor($event)" />
                </label>
                <button title="Clear All Formatting" (click)="execCmd('removeFormat')">🧹 Clear</button>
              </div>
              <div class="group-label">Typography &amp; Font</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button title="Align Left" (click)="execCmd('justifyLeft')">⬅ Left</button>
                <button title="Align Center" (click)="execCmd('justifyCenter')">↔ Center</button>
                <button title="Align Right" (click)="execCmd('justifyRight')">➡ Right</button>
                <button title="Justify" (click)="execCmd('justifyFull')">☰ Justify</button>
                <select (change)="applyBulletListStyle($any($event.target).value); $any($event.target).value=''" title="Bulleted List">
                  <option value="">• Bullets</option>
                  <option value="disc">• Disc Bullets</option>
                  <option value="circle">○ Circle Bullets</option>
                  <option value="square">▪ Square Bullets</option>
                </select>
                <select (change)="applyNumberedListStyle($any($event.target).value); $any($event.target).value=''" title="Numbered List">
                  <option value="">1. Numbering</option>
                  <option value="decimal">1, 2, 3</option>
                  <option value="lower-alpha">a, b, c</option>
                  <option value="lower-roman">i, ii, iii</option>
                </select>
                <button title="Decrease Indent" (click)="execCmd('outdent')">⇤ Outdent</button>
                <button title="Increase Indent" (click)="execCmd('indent')">⇥ Indent</button>
                <select (change)="applyLineSpacing($any($event.target).value)" title="Line Spacing">
                  <option value="1.15">↕ Spacing 1.15</option>
                  <option value="1.0">1.0 Single</option>
                  <option value="1.5">1.5 Lines</option>
                  <option value="2.0">2.0 Double</option>
                </select>
                <label class="color-picker-btn" title="Paragraph Shading Fill">
                  🪣 Shading
                  <input type="color" value="#eff6ff" (change)="applyParagraphShading($any($event.target).value)" />
                </label>
                <button title="Toggle Paragraph Box Border" (click)="toggleParagraphBorder()">▭ Border</button>
              </div>
              <div class="group-label">Paragraph &amp; Lists</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <select (change)="applyQuickHeadingStyle($any($event.target).value); $any($event.target).value=''" title="Quick Styles Gallery">
                  <option value="">Quick Styles...</option>
                  <option value="P">Normal Paragraph</option>
                  <option value="TITLE">Document Title (22pt)</option>
                  <option value="SUBTITLE">Subtitle (14pt)</option>
                  <option value="H1">Heading 1</option>
                  <option value="H2">Heading 2</option>
                  <option value="H3">Heading 3</option>
                  <option value="H4">Heading 4</option>
                  <option value="QUOTE">Block Quote</option>
                </select>
              </div>
              <div class="group-label">Styles</div>
            </div>
          }

          <!-- TAB 2: INSERT -->
          @if (ribbonTab() === 'insert') {
            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  Rows <input type="number" min="1" max="30" [(ngModel)]="insertTableRows" style="width:46px;" />
                </label>
                <label class="inline-lbl">
                  Cols <input type="number" min="1" max="15" [(ngModel)]="insertTableCols" style="width:46px;" />
                </label>
                <button class="btn-accent" (click)="insertTable(insertTableRows, insertTableCols, false)">
                  ⊞ Insert Static Table
                </button>
                <button class="btn-accent" (click)="insertTable(2, 4, true)">
                  🔁 Insert SQL Data Repeater Table
                </button>
              </div>
              <div class="group-label">Tables</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="file-upload-btn">
                  🖼 Upload Image/Logo
                  <input type="file" accept="image/*" (change)="onUploadLocalImage($event)" hidden />
                </label>
                <button (click)="insertImageByUrl()">🌐 Image by URL</button>
                <button (click)="insertHorizontalDivider()">― Horizontal Rule</button>
                <button (click)="insertCalloutBox()">💬 Callout Box</button>
                <button (click)="insertSignatureLine()">✍ Signature Line</button>
                <button (click)="insertHyperlink()">🔗 Hyperlink</button>
              </div>
              <div class="group-label">Illustrations, Shapes &amp; Links</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="focusRegion('header')">⬆ Edit Header</button>
                <button (click)="focusRegion('footer')">⬇ Edit Footer</button>
                <button (click)="insertSystemToken('PageNumber')"># Page X of Y</button>
                <button (click)="insertSystemToken('CurrentDate')">📅 Current Date</button>
                <button (click)="insertSystemToken('CurrentTime')">⏰ Current Time</button>
                <button (click)="insertSystemToken('PrintedBy')">👤 Printed By</button>
              </div>
              <div class="group-label">Header, Footer &amp; System Tokens</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="insertPageBreak()">📄 Page Break</button>
                <button (click)="insertSectionBreak()">📑 Section Break</button>
                @for (sym of specialCharacters; track sym) {
                  <button class="sym-btn" (click)="insertTextAtCursor(sym)">{{ sym }}</button>
                }
              </div>
              <div class="group-label">Breaks &amp; Symbols</div>
            </div>
          }

          <!-- TAB 3: CONTEXTUAL TABLE DESIGN & LAYOUT -->
          @if (ribbonTab() === 'table') {
            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="tableInsertRow('above')">⬆ Insert Row Above</button>
                <button (click)="tableInsertRow('below')">⬇ Insert Row Below</button>
                <button (click)="tableInsertColumn('left')">⬅ Insert Col Left</button>
                <button (click)="tableInsertColumn('right')">➡ Insert Col Right</button>
                <button class="btn-danger-lite" (click)="tableDeleteRow()">✖ Delete Row</button>
                <button class="btn-danger-lite" (click)="tableDeleteColumn()">✖ Delete Col</button>
                <button class="btn-danger-lite" (click)="tableDeleteTable()">🗑 Delete Table</button>
              </div>
              <div class="group-label">Rows &amp; Columns</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="tableMergeWithNextCell()">⊞ Merge Right Cell</button>
                <button (click)="tableSplitCurrentCell()">⊟ Split Cell</button>
                <button (click)="tableSetVerticalAlign('top')">⤒ Align Top</button>
                <button (click)="tableSetVerticalAlign('middle')">VMiddle</button>
                <button (click)="tableSetVerticalAlign('bottom')">⤓ Align Bottom</button>
                <select (change)="tableSetCellPadding($any($event.target).value)" title="Cell Padding">
                  <option value="8px">Padding: Normal (8px)</option>
                  <option value="4px">Compact (4px)</option>
                  <option value="12px">Generous (12px)</option>
                </select>
              </div>
              <div class="group-label">Merge &amp; Alignment</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="color-picker-btn">
                  🎨 Cell Shading
                  <input type="color" [(ngModel)]="tableCellShadingColor" (ngModelChange)="tableApplyCellShading($event)" />
                </label>
                <select [(ngModel)]="tableBorderStyle" (ngModelChange)="tableApplyBorders()">
                  <option value="solid">Solid Border</option>
                  <option value="dashed">Dashed Border</option>
                  <option value="dotted">Dotted Border</option>
                  <option value="double">Double Border</option>
                  <option value="none">No Border</option>
                </select>
                <select [(ngModel)]="tableBorderWidthPx" (ngModelChange)="tableApplyBorders()">
                  <option [ngValue]="1">1 px</option>
                  <option [ngValue]="2">2 px</option>
                  <option [ngValue]="3">3 px</option>
                </select>
                <label class="color-picker-btn">
                  Border Color
                  <input type="color" [(ngModel)]="tableBorderColor" (ngModelChange)="tableApplyBorders()" />
                </label>
              </div>
              <div class="group-label">Borders &amp; Shading</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="tableToggleHeaderRepeat()">
                  📌 Toggle Header Row Repeat
                </button>
                <button class="btn-accent" (click)="tableToggleRepeaterRow()">
                  🔁 Toggle SQL Repeating Data Row
                </button>
                <button (click)="tableAppendAggregateFooterRow()">
                  ∑ Add Summary Aggregate Footer Row
                </button>
              </div>
              <div class="group-label">SQL Data Binding &amp; Pagination</div>
            </div>
          }

          <!-- TAB 4: LAYOUT (Page Setup, Margins, Columns, Watermark) -->
          @if (ribbonTab() === 'layout') {
            <div class="ribbon-group">
              <div class="group-controls">
                <select [ngModel]="pageSetup.pageSize" (ngModelChange)="onPageSizeChange($event)" title="Paper Size">
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Letter (216 × 279 mm)</option>
                  <option value="Legal">Legal (216 × 356 mm)</option>
                  <option value="A3">A3 (297 × 420 mm)</option>
                  <option value="A5">A5 (148 × 210 mm)</option>
                  <option value="Custom">Custom Dimensions</option>
                </select>
                @if (pageSetup.pageSize === 'Custom') {
                  <label class="inline-lbl">
                    W(mm) <input type="number" [(ngModel)]="pageSetup.widthMm" style="width:58px;" />
                  </label>
                  <label class="inline-lbl">
                    H(mm) <input type="number" [(ngModel)]="pageSetup.heightMm" style="width:58px;" />
                  </label>
                }
                <select [(ngModel)]="pageSetup.orientation" title="Orientation">
                  <option value="Portrait">📄 Portrait</option>
                  <option value="Landscape">📃 Landscape</option>
                </select>
                <select (change)="applyMarginPreset($any($event.target).value)" title="Margins Preset">
                  <option value="normal">Margins: Normal (20mm)</option>
                  <option value="narrow">Narrow (12.7mm)</option>
                  <option value="moderate">Moderate (19mm/25mm)</option>
                  <option value="wide">Wide (25.4mm/50.8mm)</option>
                </select>
                <label class="inline-lbl" title="Top/Bottom/Left/Right Margins in mm">
                  T <input type="number" [(ngModel)]="pageSetup.marginTopMm" style="width:45px;" />
                  B <input type="number" [(ngModel)]="pageSetup.marginBottomMm" style="width:45px;" />
                  L <input type="number" [(ngModel)]="pageSetup.marginLeftMm" style="width:45px;" />
                  R <input type="number" [(ngModel)]="pageSetup.marginRightMm" style="width:45px;" />
                </label>
              </div>
              <div class="group-label">Page Size, Orientation &amp; Margins (mm)</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <select [(ngModel)]="pageSetup.columns" title="Page Columns">
                  <option [ngValue]="1">1 Column</option>
                  <option [ngValue]="2">2 Columns</option>
                  <option [ngValue]="3">3 Columns</option>
                </select>
              </div>
              <div class="group-label">Columns</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  <input type="checkbox" [(ngModel)]="watermark.enabled" /> Enable Watermark
                </label>
                <select [(ngModel)]="watermark.type">
                  <option value="Text">Text Watermark</option>
                  <option value="Image">Image URL Watermark</option>
                </select>
                @if (watermark.type === 'Text') {
                  <input
                    type="text"
                    [(ngModel)]="watermark.text"
                    placeholder="DRAFT / CONFIDENTIAL"
                    style="width:130px;"
                  />
                  <input type="color" [(ngModel)]="watermark.color" title="Watermark Color" />
                } @else {
                  <input
                    type="text"
                    [(ngModel)]="watermark.imageUrl"
                    placeholder="Logo Image URL..."
                    style="width:160px;"
                  />
                }
                <select [(ngModel)]="watermark.rotationDeg" title="Watermark Orientation">
                  <option [ngValue]="-45">Diagonal (-45°)</option>
                  <option [ngValue]="0">Horizontal (0°)</option>
                </select>
              </div>
              <div class="group-label">Page Watermark</div>
            </div>
          }

          <!-- TAB 5: VIEW -->
          @if (ribbonTab() === 'view') {
            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  Zoom: {{ zoomPercent() }}%
                  <input
                    type="range"
                    min="50"
                    max="200"
                    step="10"
                    [ngModel]="zoomPercent()"
                    (ngModelChange)="zoomPercent.set($event)"
                  />
                </label>
                <button (click)="zoomPercent.set(100)">100%</button>
                <button (click)="zoomPercent.set(80)">Fit Page</button>
                <button (click)="zoomPercent.set(120)">Fit Width</button>
              </div>
              <div class="group-label">Zoom</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  <input type="checkbox" [ngModel]="showRulers()" (ngModelChange)="showRulers.set($event)" />
                  Show Rulers (mm)
                </label>
                <label class="inline-lbl">
                  <input type="checkbox" [(ngModel)]="showGridlines" />
                  Show Table Gridlines
                </label>
                <label class="inline-lbl">
                  First-Line Indent (mm):
                  <input
                    type="number"
                    min="0"
                    max="60"
                    [ngModel]="firstLineIndentMm()"
                    (ngModelChange)="applyFirstLineIndent($event)"
                    style="width:52px;"
                  />
                </label>
              </div>
              <div class="group-label">Rulers &amp; Gridlines</div>
            </div>
          }
        </div>
      </div>

      <!-- Optional Find & Replace Bar -->
      @if (showFindReplace()) {
        <div class="find-replace-bar">
          <strong>Find &amp; Replace:</strong>
          <input type="text" [(ngModel)]="findText" placeholder="Find text in document..." />
          <input type="text" [(ngModel)]="replaceText" placeholder="Replace with..." />
          <button class="btn-accent" (click)="runFindAndReplace()">Replace All</button>
          <button (click)="showFindReplace.set(false)">Close</button>
        </div>
      }

      <!-- Main Split Workspace: Paginated Canvas (Left/Center) + Governed Field & Filter Sidebar (Right) -->
      <div class="workspace-split">
        <!-- Center Canvas Area with Horizontal & Vertical Rulers -->
        <div class="canvas-viewport">
          @if (showRulers()) {
            <div class="horizontal-ruler" [style.width.mm]="effectivePageWidthMm()">
              @for (cm of horizontalRulerTicks(); track cm) {
                <span class="ruler-tick" [style.left.mm]="cm * 10">{{ cm }}</span>
              }
              <div
                class="indent-marker"
                [style.left.mm]="pageSetup.marginLeftMm + firstLineIndentMm()"
                title="First-line Indent Marker"
              >▼</div>
            </div>
          }

          <div class="canvas-row-wrap">
            @if (showRulers()) {
              <div class="vertical-ruler" [style.minHeight.mm]="effectivePageHeightMm()">
                @for (cm of verticalRulerTicks(); track cm) {
                  <span class="v-ruler-tick" [style.top.mm]="cm * 10">{{ cm }}</span>
                }
              </div>
            }

            <!-- Paginated Physical Sheet -->
            <div
              class="page-sheet"
              [class.show-gridlines]="showGridlines"
              [style.width.mm]="effectivePageWidthMm()"
              [style.minHeight.mm]="effectivePageHeightMm()"
              [style.paddingTop.mm]="pageSetup.marginTopMm"
              [style.paddingBottom.mm]="pageSetup.marginBottomMm"
              [style.paddingLeft.mm]="pageSetup.marginLeftMm"
              [style.paddingRight.mm]="pageSetup.marginRightMm"
              [style.transform]="'scale(' + zoomPercent() / 100 + ')'"
              (dragover)="onCanvasDragOver($event)"
              (drop)="onCanvasDrop($event)"
            >
              <!-- Watermark Layer -->
              @if (watermark.enabled) {
                <div
                  class="watermark-layer"
                  [style.opacity]="watermark.opacity"
                >
                  @if (watermark.type === 'Image' && watermark.imageUrl) {
                    <img
                      [src]="watermark.imageUrl"
                      [style.transform]="'rotate(' + watermark.rotationDeg + 'deg)'"
                      alt="Watermark"
                    />
                  } @else {
                    <span
                      [style.color]="watermark.color"
                      [style.fontSize.pt]="watermark.fontSizePt"
                      [style.transform]="'rotate(' + watermark.rotationDeg + 'deg)'"
                    >
                      {{ watermark.text }}
                    </span>
                  }
                </div>
              }

              <!-- Repeating Page Header Region -->
              <div class="sheet-region header-region">
                <div class="region-badge">Repeating Header</div>
                <div
                  #headerEditor
                  class="editable-surface header-surface"
                  contenteditable="true"
                  (focus)="activeEditorRegion.set('header')"
                  (keyup)="syncCanvasState()"
                  (mouseup)="onEditorMouseUp()"
                  (contextmenu)="onCanvasRightClick($event)"
                ></div>
              </div>

              <!-- Main Multi-Column Rich Text Body Region -->
              <div class="sheet-region body-region">
                <div
                  #bodyEditor
                  class="editable-surface body-surface"
                  contenteditable="true"
                  [style.columnCount]="pageSetup.columns"
                  [style.columnGap.mm]="8"
                  (focus)="activeEditorRegion.set('body')"
                  (keyup)="syncCanvasState()"
                  (mouseup)="onEditorMouseUp()"
                  (contextmenu)="onCanvasRightClick($event)"
                ></div>
              </div>

              <!-- Repeating Page Footer Region -->
              <div class="sheet-region footer-region">
                <div class="region-badge">Repeating Footer</div>
                <div
                  #footerEditor
                  class="editable-surface footer-surface"
                  contenteditable="true"
                  (focus)="activeEditorRegion.set('footer')"
                  (keyup)="syncCanvasState()"
                  (mouseup)="onEditorMouseUp()"
                  (contextmenu)="onCanvasRightClick($event)"
                ></div>
              </div>
            </div>
          </div>

          <!-- Auto-Compiled Parameterized SQL Drawer -->
          @if (showSqlDrawer()) {
            <div class="sql-drawer">
              <div class="sql-drawer-header">
                <strong>⚡ Auto-Compiled Parameterized LEFT JOIN T-SQL Query</strong>
                <span>Anchor: {{ anchorTable() || 'None (Zero-State)' }} | Joins: {{ resolvedJoinPath().length }}</span>
              </div>
              <pre class="sql-code">{{ compiledSqlPreview() }}</pre>
            </div>
          }
        </div>

        <!-- Right Sidebar: FK-Governed Database Fields & Runtime Filter Builder -->
        <aside class="right-sidebar">
          <div class="sidebar-tabs">
            <button
              [class.active]="sidebarTab() === 'fields'"
              (click)="sidebarTab.set('fields')"
            >
              🗄 Governed Fields ({{ publishedFields().length }})
            </button>
            <button
              [class.active]="sidebarTab() === 'filters'"
              (click)="sidebarTab.set('filters')"
            >
              🔍 Filter Builder ({{ runtimeFilters().length }})
            </button>
          </div>

          @if (sidebarTab() === 'fields') {
            <!-- Anchor State & Reachability Banner -->
            <div class="reachability-banner" [class.has-anchor]="!!anchorTable()">
              @if (anchorTable(); as anchor) {
                <div class="anchor-info">
                  <div>
                    <span class="anchor-label">⚓ Anchor Table:</span>
                    <strong>{{ anchor }}</strong>
                  </div>
                  <button class="btn-reset-anchor" (click)="resetCanvasFields()">
                    Reset All Fields
                  </button>
                </div>
                <div class="reach-stats">
                  ✓ {{ reachableTableCount() }} Reachable Tables | 🔒 {{ lockedTableCount() }} Locked (No FK Path)
                </div>
              } @else {
                <div class="zero-state-info">
                  <strong>🟢 Zero-State (All Published Fields Unlocked)</strong>
                  <span>Drag or click any field to set the Anchor Table and activate FK graph reachability.</span>
                </div>
              }
            </div>

            <div class="field-search-box">
              <input
                type="text"
                placeholder="Search published fields or tables..."
                [ngModel]="fieldSearch()"
                (ngModelChange)="fieldSearch.set($event)"
              />
            </div>

            <div class="field-groups-scroll">
              @for (grp of groupedSidebarTables(); track grp.tableName) {
                <div class="table-field-group" [class.table-locked]="!grp.isReachable">
                  <div class="group-header" [title]="grp.lockReason || 'Reachable via Foreign Key Graph'">
                    <div class="grp-title">
                      <span>{{ grp.isReachable ? '🟢' : '🔒' }} {{ grp.tableName }}</span>
                      @if (grp.hopDistance > 0) {
                        <span class="hop-pill">{{ grp.hopDistance }} hop{{ grp.hopDistance > 1 ? 's' : '' }}</span>
                      }
                      @if (grp.requiresRoleDisambiguation) {
                        <span class="role-pill" title="Multiple Foreign Keys exist — Role selection required on drop">
                          {{ grp.availableRoles.length }} Roles
                        </span>
                      }
                    </div>
                    <span class="grp-cat">{{ grp.category }}</span>
                  </div>

                  @if (!grp.isReachable) {
                    <div class="locked-reason-banner">
                      {{ grp.lockReason }}
                    </div>
                  }

                  <div class="field-items">
                    @for (fld of grp.fields; track fld.columnName) {
                      <div
                        class="field-pill"
                        [class.disabled-pill]="!grp.isReachable"
                        [attr.draggable]="grp.isReachable ? 'true' : 'false'"
                        [title]="grp.isReachable ? 'Drag onto canvas or click to insert ' + fld.displayName : grp.lockReason"
                        (dragstart)="onFieldDragStart($event, fld, grp.isReachable)"
                        (click)="onFieldClickInsert(fld, grp.isReachable)"
                      >
                        <div class="fld-main">
                          <span class="fld-alias">{{ fld.displayName }}</span>
                          <code class="fld-col">{{ fld.columnName }}</code>
                        </div>
                        <div class="fld-right">
                          <span class="fld-type">{{ fld.dataType }}</span>
                          @if (grp.isReachable) {
                            <button
                              class="btn-add-filter-mini"
                              title="Add as Runtime Filter"
                              (click)="addFilterFromField(fld); $event.stopPropagation()"
                            >
                              +Filter
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <!-- Runtime Filter Builder Tab -->
            <div class="filter-builder-pane">
              <div class="filter-builder-help">
                Configure runtime prompts for the Report Runner page. Values bind strictly via parameterized
                <code>&#64;Param0</code>, <code>&#64;Param1</code> SQL parameters.
              </div>

              <div class="add-filter-box">
                <label>Add Reachable Field as Runtime Filter</label>
                <select (change)="onSelectFieldForNewFilter($any($event.target).value); $any($event.target).value=''">
                  <option value="">-- Choose Reachable Published Field --</option>
                  @for (fld of reachablePublishedFields(); track fld.tableName + '.' + fld.columnName) {
                    <option [value]="fld.tableName + '.' + fld.columnName">
                      {{ fld.tableName }} — {{ fld.displayName }} ({{ fld.dataType }})
                    </option>
                  }
                </select>
              </div>

              <div class="filter-cards-list">
                @for (flt of runtimeFilters(); track flt.filterId; let idx = $index) {
                  <div class="filter-config-card">
                    <div class="flt-card-top">
                      <strong>#{{ idx + 1 }} {{ flt.tableName }}.{{ flt.columnName }}</strong>
                      <button class="btn-remove-flt" (click)="removeRuntimeFilter(flt.filterId)">✖</button>
                    </div>

                    <div class="flt-row">
                      <label>Prompt Label</label>
                      <input type="text" [(ngModel)]="flt.filterLabel" (blur)="refreshSqlCompilation()" />
                    </div>

                    <div class="flt-row-split">
                      <div>
                        <label>SQL Operator</label>
                        <select [(ngModel)]="flt.operator" (ngModelChange)="onFilterOperatorChange(flt)">
                          <option value="=">= (Equals)</option>
                          <option value="!=">!= (Not Equal)</option>
                          <option value="IN">IN (Multi-Value)</option>
                          <option value="BETWEEN">BETWEEN (Range)</option>
                          <option value="LIKE">LIKE (Contains)</option>
                          <option value=">">&gt; (Greater)</option>
                          <option value="<">&lt; (Less)</option>
                          <option value=">=">&gt;= (Min)</option>
                          <option value="<=">&lt;= (Max)</option>
                        </select>
                      </div>
                      <div>
                        <label>UI Control Type</label>
                        <select [(ngModel)]="flt.uiControlType">
                          <option value="Dropdown">Dropdown (Distinct Lookup)</option>
                          <option value="MultiSelect">MultiSelect</option>
                          <option value="Text">Text Input</option>
                          <option value="NumberInput">Numeric Input</option>
                          <option value="DatePicker">Date Picker</option>
                          <option value="DateRangePicker">Date Range Picker</option>
                          <option value="Checkbox">Checkbox (Bit)</option>
                        </select>
                      </div>
                    </div>

                    <div class="flt-row-split">
                      <label class="inline-lbl">
                        <input type="checkbox" [(ngModel)]="flt.isRequired" /> Required Filter
                      </label>
                      <input
                        type="text"
                        [(ngModel)]="flt.defaultValue"
                        placeholder="Default value (optional)"
                      />
                    </div>
                  </div>
                } @empty {
                  <div class="empty-filters">
                    No runtime filters configured yet. Click <strong>+Filter</strong> on any reachable field or select one above.
                  </div>
                }
              </div>
            </div>
          }
        </aside>
      </div>

      <!-- Role-Playing Foreign Key Disambiguation Modal (D-03 / BIND-02) -->
      @if (pendingRoleDrop(); as pending) {
        <div class="modal-backdrop" (click)="cancelRoleSelection()">
          <div class="modal-dialog" (click)="$event.stopPropagation()">
            <h3>🔀 Select Foreign Key Relationship Role</h3>
            <p>
              Multiple Foreign Keys connect <strong>{{ anchorTable() }}</strong> to
              <strong>{{ pending.field.tableName }}</strong>. Which relationship role should this field use?
            </p>
            <div class="role-options-list">
              @for (role of pending.roles; track role.constraintName) {
                <button class="role-option-btn" (click)="confirmRoleSelection(role)">
                  <div>
                    <strong>{{ role.roleLabel }}</strong>
                    <div class="role-meta">
                      Constraint: <code>{{ role.constraintName }}</code> | Alias: <code>{{ role.suggestedAlias }}</code>
                    </div>
                  </div>
                  <span>Select →</span>
                </button>
              }
            </div>
          </div>
        </div>
      }

      <!-- Right-Click Field Formatting Popover (BIND-04) -->
      @if (formattingTargetTag(); as tagInfo) {
        <div
          class="format-popover"
          [style.left.px]="tagInfo.x"
          [style.top.px]="tagInfo.y"
          (click)="$event.stopPropagation()"
        >
          <h4>⚙ Format Merge Tag: {{ tagInfo.label }}</h4>
          <div class="fmt-field">
            <label>Date / Number / Currency Format</label>
            <select [(ngModel)]="tagInfo.formatString">
              <option value="">Default (Raw / Auto)</option>
              <option value="DD-MM-YYYY">Date: DD-MM-YYYY (e.g. 15-10-2026)</option>
              <option value="dd-MMM-yyyy">Date: dd-MMM-yyyy (e.g. 15-Oct-2026)</option>
              <option value="yyyy-MM-dd">Date: yyyy-MM-dd</option>
              <option value="dd-MM-yyyy HH:mm">Date &amp; Time: dd-MM-yyyy HH:mm</option>
              <option value="₹ #,##0.00">Currency (INR): ₹ #,##0.00</option>
              <option value="$ #,##0.00">Currency (USD): $ #,##0.00</option>
              <option value="#,##0.00">Decimal: #,##0.00</option>
              <option value="#,##0">Integer: #,##0</option>
            </select>
          </div>
          <div class="fmt-field">
            <label>Text Case Transform</label>
            <select [(ngModel)]="tagInfo.textTransform">
              <option value="">None</option>
              <option value="UPPERCASE">UPPERCASE</option>
              <option value="lowercase">lowercase</option>
              <option value="TitleCase">Title Case</option>
            </select>
          </div>
          <div class="fmt-field">
            <label>Table Footer Aggregate Function</label>
            <select [(ngModel)]="tagInfo.aggregateFunction">
              <option value="NONE">NONE (Scalar / Row Value)</option>
              <option value="SUM">SUM (Total)</option>
              <option value="COUNT">COUNT (Row Count)</option>
              <option value="AVG">AVG (Average)</option>
              <option value="MIN">MIN (Minimum)</option>
              <option value="MAX">MAX (Maximum)</option>
            </select>
          </div>
          <div class="fmt-field">
            <label>Default Value if NULL</label>
            <input type="text" [(ngModel)]="tagInfo.nullDefaultValue" placeholder="e.g., N/A or 0.00" />
          </div>
          <div class="fmt-actions">
            <button class="btn-save-fmt" (click)="applyFieldFormatting()">Apply Formatting</button>
            <button class="btn-remove-tag" (click)="deleteFormattedMergeTag()">Remove Field</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0%;
      min-height: 0;
      height: calc(100vh - 52px);
      overflow: hidden;
    }
    .designer-root {
      display: flex;
      flex-direction: column;
      flex: 1 1 0%;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: #e2e8f0;
      user-select: none;
    }
    .template-bar {
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #ffffff;
      border-bottom: 1px solid #cbd5e1;
      gap: 12px;
    }
    .template-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }
    .template-picker, .doc-mode-select {
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      font-size: 12.5px;
      background: #f8fafc;
    }
    .template-name-input {
      padding: 6px 12px;
      border: 1px solid #94a3b8;
      border-radius: 5px;
      font-size: 13px;
      font-weight: 600;
      min-width: 260px;
    }
    .template-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .save-toast {
      background: #dcfce7;
      color: #166534;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .btn-sql-toggle {
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #334155;
      padding: 6px 12px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-save {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 5px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-run {
      background: #059669;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 5px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .word-ribbon {
      flex: 0 0 auto;
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .ribbon-tabs {
      display: flex;
      gap: 2px;
      padding: 4px 14px 0;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
    }
    .ribbon-tabs button {
      border: 1px solid transparent;
      border-bottom: none;
      background: transparent;
      padding: 6px 16px;
      font-size: 12.5px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      border-radius: 5px 5px 0 0;
    }
    .ribbon-tabs button.active {
      background: #ffffff;
      color: #1e3a8a;
      border-color: #cbd5e1;
    }
    .ribbon-tabs button.contextual-tab {
      color: #b45309;
      background: #fef3c7;
    }
    .ribbon-body {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 8px 14px;
      background: #ffffff;
      min-height: 66px;
      align-items: stretch;
    }
    .ribbon-group {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding-right: 10px;
      border-right: 1px solid #e2e8f0;
    }
    .group-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .group-controls button, .group-controls select, .file-upload-btn, .color-picker-btn {
      padding: 4px 8px;
      font-size: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
      color: #1e293b;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .group-controls button:hover, .file-upload-btn:hover {
      background: #e2e8f0;
    }
    .group-controls button.active-tool, .group-controls button.btn-accent {
      background: #dbeafe;
      border-color: #60a5fa;
      color: #1e3a8a;
      font-weight: 600;
    }
    .btn-danger-lite {
      background: #fee2e2 !important;
      color: #991b1b !important;
      border-color: #fca5a5 !important;
    }
    .color-picker-btn input[type="color"] {
      width: 18px;
      height: 18px;
      border: none;
      padding: 0;
      background: transparent;
      cursor: pointer;
    }
    .inline-lbl {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11.5px;
      font-weight: 600;
      color: #334155;
    }
    .sym-btn {
      font-weight: 700;
      min-width: 28px;
      justify-content: center;
    }
    .group-label {
      font-size: 10px;
      text-align: center;
      color: #64748b;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .find-replace-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: #fef9c3;
      border-bottom: 1px solid #fde047;
      font-size: 12.5px;
    }
    .find-replace-bar input {
      padding: 4px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
    }
    .workspace-split {
      flex: 1 1 0%;
      min-height: 0;
      min-width: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      overflow: hidden;
    }
    .canvas-viewport {
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow-y: scroll;
      overflow-x: auto;
      padding: 20px 28px 120px;
      display: block;
      position: relative;
      background: #cbd5e1;
    }
    .horizontal-ruler {
      height: 22px;
      background: #f8fafc;
      border: 1px solid #94a3b8;
      position: relative;
      margin: 0 auto 6px;
      box-shadow: inset 0 -2px 0 #cbd5e1;
    }
    .ruler-tick {
      position: absolute;
      top: 2px;
      font-size: 9px;
      color: #475569;
      border-left: 1px solid #64748b;
      padding-left: 2px;
      height: 16px;
    }
    .indent-marker {
      position: absolute;
      bottom: -2px;
      color: #2563eb;
      font-size: 11px;
      font-weight: 700;
    }
    .canvas-row-wrap {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 6px;
      width: fit-content;
      margin: 0 auto;
      padding-bottom: 80px;
    }
    .vertical-ruler {
      width: 22px;
      background: #f8fafc;
      border: 1px solid #94a3b8;
      position: relative;
    }
    .v-ruler-tick {
      position: absolute;
      left: 2px;
      font-size: 9px;
      color: #475569;
      border-top: 1px solid #64748b;
      width: 16px;
    }
    .page-sheet {
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      border: 1px solid #cbd5e1;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transform-origin: top center;
      user-select: text;
    }
    .watermark-layer {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 1;
      overflow: hidden;
    }
    .watermark-layer span {
      font-weight: 800;
      letter-spacing: 4px;
      white-space: nowrap;
    }
    .watermark-layer img {
      max-width: 65%;
      max-height: 65%;
    }
    .sheet-region {
      position: relative;
      z-index: 2;
    }
    .header-region {
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .footer-region {
      border-top: 1px dashed #cbd5e1;
      padding-top: 8px;
      margin-top: 12px;
    }
    .region-badge {
      position: absolute;
      right: 0;
      top: -14px;
      font-size: 9px;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.5px;
      pointer-events: none;
    }
    .editable-surface {
      outline: none;
      min-height: 36px;
      font-family: Calibri, 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #0f172a;
    }
    .body-surface {
      min-height: 210mm;
    }
    :host ::ng-deep .page-sheet.show-gridlines table,
    :host ::ng-deep .page-sheet.show-gridlines td,
    :host ::ng-deep .page-sheet.show-gridlines th {
      outline: 1px dotted #94a3b8;
    }
    :host ::ng-deep .merge-tag {
      display: inline-block;
      background: #dbeafe;
      color: #1e3a8a;
      border: 1px solid #60a5fa;
      border-radius: 4px;
      padding: 1px 6px;
      margin: 0 2px;
      font-family: 'Segoe UI', monospace;
      font-size: 9.5pt;
      font-weight: 600;
      cursor: context-menu;
    }
    :host ::ng-deep tr[data-repeater="true"] {
      background: rgba(236, 253, 245, 0.55);
      outline: 2px dashed #10b981;
    }
    :host ::ng-deep tr[data-repeat-header="true"] {
      outline: 2px solid #1e3a8a;
    }
    .sql-drawer {
      width: 100%;
      max-width: 900px;
      margin: 18px auto 40px;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .sql-drawer-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #38bdf8;
      margin-bottom: 8px;
    }
    .sql-code {
      margin: 0;
      font-family: Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      color: #a7f3d0;
    }
    .right-sidebar {
      background: #ffffff;
      border-left: 1px solid #cbd5e1;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .sidebar-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #cbd5e1;
      background: #f1f5f9;
    }
    .sidebar-tabs button {
      padding: 10px 8px;
      border: none;
      background: transparent;
      font-size: 12.5px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
    }
    .sidebar-tabs button.active {
      background: #ffffff;
      color: #1e3a8a;
      border-bottom: 2px solid #2563eb;
    }
    .reachability-banner {
      padding: 10px 12px;
      background: #f0fdf4;
      border-bottom: 1px solid #bbf7d0;
      font-size: 12px;
    }
    .reachability-banner.has-anchor {
      background: #eff6ff;
      border-bottom-color: #bfdbfe;
    }
    .anchor-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .btn-reset-anchor {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .reach-stats {
      font-size: 11px;
      color: #1e40af;
      font-weight: 600;
    }
    .zero-state-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: #166534;
    }
    .zero-state-info span {
      font-size: 11px;
      color: #15803d;
    }
    .field-search-box {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .field-search-box input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12.5px;
    }
    .field-groups-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: scroll;
      padding: 8px;
    }
    .table-field-group {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .table-field-group.table-locked {
      opacity: 0.62;
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .group-header {
      padding: 6px 10px;
      background: #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
    }
    .grp-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hop-pill {
      background: #dbeafe;
      color: #1d4ed8;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 10px;
    }
    .role-pill {
      background: #fef3c7;
      color: #b45309;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 10px;
    }
    .grp-cat {
      font-size: 10.5px;
      color: #64748b;
      font-weight: 500;
    }
    .locked-reason-banner {
      background: #fef2f2;
      color: #991b1b;
      font-size: 11px;
      padding: 4px 10px;
      border-bottom: 1px solid #fecaca;
    }
    .field-items {
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-pill {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      cursor: grab;
      font-size: 12px;
    }
    .field-pill:hover:not(.disabled-pill) {
      border-color: #2563eb;
      background: #eff6ff;
    }
    .field-pill.disabled-pill {
      cursor: not-allowed;
      background: #f1f5f9;
    }
    .fld-main {
      display: flex;
      flex-direction: column;
    }
    .fld-alias {
      font-weight: 600;
      color: #0f172a;
    }
    .fld-col {
      font-size: 10.5px;
      color: #64748b;
    }
    .fld-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .fld-type {
      font-size: 10px;
      background: #e2e8f0;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .btn-add-filter-mini {
      font-size: 10px;
      padding: 2px 5px;
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #86efac;
      border-radius: 3px;
      cursor: pointer;
    }
    .filter-builder-pane {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: scroll;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .filter-builder-help {
      font-size: 12px;
      color: #475569;
      background: #f8fafc;
      padding: 8px;
      border-radius: 5px;
      border: 1px solid #e2e8f0;
    }
    .add-filter-box {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .add-filter-box label {
      font-size: 11.5px;
      font-weight: 600;
    }
    .add-filter-box select {
      padding: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
    }
    .filter-config-card {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 8px;
    }
    .flt-card-top {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }
    .btn-remove-flt {
      border: none;
      background: transparent;
      color: #dc2626;
      cursor: pointer;
      font-weight: 700;
    }
    .flt-row, .flt-row-split {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11.5px;
    }
    .flt-row-split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .flt-row input, .flt-row-split select, .flt-row-split input[type="text"] {
      padding: 5px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
      width: 100%;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-dialog {
      background: #ffffff;
      border-radius: 8px;
      padding: 20px;
      width: 480px;
      max-width: 92vw;
      box-shadow: 0 12px 32px rgba(0,0,0,0.25);
    }
    .role-options-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .role-option-btn {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      cursor: pointer;
      text-align: left;
    }
    .role-option-btn:hover {
      background: #eff6ff;
      border-color: #2563eb;
    }
    .role-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .format-popover {
      position: fixed;
      background: #ffffff;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      padding: 14px;
      width: 290px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.22);
      z-index: 1100;
    }
    .format-popover h4 {
      margin: 0 0 10px;
      font-size: 13px;
      color: #1e3a8a;
    }
    .fmt-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-bottom: 8px;
      font-size: 11.5px;
    }
    .fmt-field select, .fmt-field input {
      padding: 5px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
    }
    .fmt-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
    }
    .btn-save-fmt {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .btn-remove-tag {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
  `]
})
export class ReportDesignerComponent implements OnInit {
  private readonly managerApi = inject(ManagerApiService);
  private readonly reportApi = inject(ReportApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('headerEditor', { static: true }) headerEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('bodyEditor', { static: true }) bodyEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('footerEditor', { static: true }) footerEditorRef!: ElementRef<HTMLDivElement>;

  readonly ribbonTab = signal<'home' | 'insert' | 'table' | 'layout' | 'view'>('home');
  readonly sidebarTab = signal<'fields' | 'filters'>('fields');
  readonly activeEditorRegion = signal<'header' | 'body' | 'footer'>('body');

  readonly savedTemplates = signal<SavedReportTemplateDto[]>([]);
  readonly currentTemplateId = signal<number | null>(null);
  templateName = 'New TMS Paginated Report';
  templateDescription = '';
  documentMode: 'SingleOrBatchDocument' | 'SummaryList' = 'SingleOrBatchDocument';

  readonly saving = signal<boolean>(false);
  readonly statusToast = signal<string>('');
  readonly showSqlDrawer = signal<boolean>(false);
  readonly showFindReplace = signal<boolean>(false);
  readonly formatPainterActive = signal<boolean>(false);
  private copiedInlineStyle = '';

  findText = '';
  replaceText = '';

  readonly fontFamilies = [
    'Calibri',
    'Arial',
    'Times New Roman',
    'Segoe UI',
    'Roboto',
    'Georgia',
    'Courier New',
    'Verdana'
  ];
  readonly fontSizesPt = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72];
  readonly specialCharacters = ['₹', '$', '€', '£', '¥', '©', '®', '™', '±', '≠', '≤', '≥'];

  selectedFontFamily = 'Calibri';
  selectedFontSizePt = 11;
  textColor = '#0f172a';
  highlightColor = '#fef08a';

  insertTableRows = 3;
  insertTableCols = 4;

  tableCellShadingColor = '#f8fafc';
  tableBorderStyle = 'solid';
  tableBorderWidthPx = 1;
  tableBorderColor = '#cbd5e1';
  readonly isCursorInTable = signal<boolean>(false);
  private activeTableElement: HTMLTableElement | null = null;
  private activeTableRowElement: HTMLTableRowElement | null = null;
  private activeTableCellElement: HTMLTableCellElement | null = null;

  pageSetup: PageSetupDto = {
    pageSize: 'A4',
    orientation: 'Portrait',
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
    marginRightMm: 20,
    columns: 1
  };

  watermark: WatermarkDto = {
    enabled: false,
    type: 'Text',
    text: 'CONFIDENTIAL',
    imageUrl: '',
    rotationDeg: -45,
    opacity: 0.1,
    color: '#64748b',
    fontSizePt: 60
  };

  showGridlines = true;
  readonly zoomPercent = signal<number>(100);
  readonly showRulers = signal<boolean>(true);
  readonly firstLineIndentMm = signal<number>(0);

  // Database Fields & FK Reachability State
  readonly publishedFields = signal<CatalogColumnDto[]>([]);
  readonly fieldSearch = signal<string>('');
  readonly reachabilityState = signal<ReachabilityResult | null>(null);
  readonly selectedFields = signal<SelectedFieldDto[]>([]);
  readonly runtimeFilters = signal<RuntimeFilterConfigDto[]>([]);
  readonly selectedRoleConstraints = signal<Record<string, string>>({});
  readonly resolvedJoinPath = signal<JoinStepDto[]>([]);
  readonly compiledSqlPreview = signal<string>('SELECT 1 AS [EmptyReport] WHERE 1=1 /*DYNAMIC_FILTERS*/');

  private draggedField: CatalogColumnDto | null = null;
  readonly pendingRoleDrop = signal<{
    field: CatalogColumnDto;
    roles: RoleOptionDto[];
  } | null>(null);

  readonly formattingTargetTag = signal<{
    element: HTMLElement;
    label: string;
    x: number;
    y: number;
    formatString: string;
    textTransform: string;
    aggregateFunction: string;
    nullDefaultValue: string;
  } | null>(null);

  readonly anchorTable = computed(() => {
    const fields = this.selectedFields();
    return fields.length > 0 ? fields[0].tableName : null;
  });

  readonly effectivePageWidthMm = computed(() =>
    this.pageSetup.orientation === 'Landscape'
      ? Math.max(this.pageSetup.widthMm, this.pageSetup.heightMm)
      : Math.min(this.pageSetup.widthMm, this.pageSetup.heightMm)
  );

  readonly effectivePageHeightMm = computed(() =>
    this.pageSetup.orientation === 'Landscape'
      ? Math.min(this.pageSetup.widthMm, this.pageSetup.heightMm)
      : Math.max(this.pageSetup.widthMm, this.pageSetup.heightMm)
  );

  readonly horizontalRulerTicks = computed(() => {
    const cmCount = Math.floor(this.effectivePageWidthMm() / 10);
    return Array.from({ length: cmCount + 1 }, (_, i) => i);
  });

  readonly verticalRulerTicks = computed(() => {
    const cmCount = Math.floor(this.effectivePageHeightMm() / 10);
    return Array.from({ length: cmCount + 1 }, (_, i) => i);
  });

  readonly groupedSidebarTables = computed(() => {
    const term = this.fieldSearch().trim().toLowerCase();
    const reach = this.reachabilityState();
    const groupsMap = new Map<string, CatalogColumnDto[]>();

    for (const fld of this.publishedFields()) {
      if (
        term &&
        !fld.tableName.toLowerCase().includes(term) &&
        !fld.displayName.toLowerCase().includes(term) &&
        !fld.columnName.toLowerCase().includes(term)
      ) {
        continue;
      }
      const list = groupsMap.get(fld.tableName) ?? [];
      list.push(fld);
      groupsMap.set(fld.tableName, list);
    }

    const result: Array<{
      tableName: string;
      category: string;
      isReachable: boolean;
      hopDistance: number;
      lockReason: string | null;
      requiresRoleDisambiguation: boolean;
      availableRoles: RoleOptionDto[];
      fields: CatalogColumnDto[];
    }> = [];

    for (const [tableName, fields] of groupsMap.entries()) {
      const detail = reach?.tableDetails?.[tableName];
      const isReachable = reach ? (detail ? detail.isReachable : false) : true;
      const lockReason = !isReachable
        ? (detail?.lockReason ?? 'Cannot add: No Foreign Key relationship with selected tables')
        : null;

      result.push({
        tableName,
        category: fields[0]?.category ?? 'General',
        isReachable,
        hopDistance: detail?.hopDistance ?? 0,
        lockReason,
        requiresRoleDisambiguation: detail?.requiresRoleDisambiguation ?? false,
        availableRoles: detail?.availableRoles ?? [],
        fields
      });
    }

    return result.sort((a, b) => {
      if (a.isReachable !== b.isReachable) return a.isReachable ? -1 : 1;
      if (a.hopDistance !== b.hopDistance) return a.hopDistance - b.hopDistance;
      return a.tableName.localeCompare(b.tableName);
    });
  });

  readonly reachableTableCount = computed(
    () => this.groupedSidebarTables().filter((g) => g.isReachable).length
  );

  readonly lockedTableCount = computed(
    () => this.groupedSidebarTables().filter((g) => !g.isReachable).length
  );

  readonly reachablePublishedFields = computed(() => {
    const list: CatalogColumnDto[] = [];
    for (const grp of this.groupedSidebarTables()) {
      if (grp.isReachable) {
        list.push(...grp.fields);
      }
    }
    return list;
  });

  ngOnInit(): void {
    this.initializeBlankDocumentSurface();

    this.managerApi.getPublishedFields().subscribe({
      next: (fields) => {
        this.publishedFields.set(fields);
        this.refreshReachabilityAndSql();
      }
    });

    this.reportApi.getTemplates().subscribe({
      next: (templates) => {
        this.savedTemplates.set(templates);
        const routeId = Number(this.route.snapshot.paramMap.get('id'));
        if (routeId > 0) {
          this.loadTemplateIntoDesigner(routeId);
        } else if (templates.length > 0) {
          this.loadTemplateIntoDesigner(templates[0].templateId);
        }
      }
    });
  }

  initializeBlankDocumentSurface(): void {
    this.headerEditorRef.nativeElement.innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:9pt;color:#475569;"><span><strong>TMS ENTERPRISE REPORT</strong></span><span>Date: {{SYSTEM.CurrentDate}}</span></div>';
    this.bodyEditorRef.nativeElement.innerHTML =
      '<h2 style="color:#1e3a8a;margin-top:0;">Report Title</h2><p>Drag or click governed database fields from the right sidebar to bind data into paragraphs or repeating tables.</p>';
    this.footerEditorRef.nativeElement.innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:9pt;color:#64748b;"><span>Printed by: {{SYSTEM.PrintedBy}}</span><span>Page {{SYSTEM.PageNumber}} of {{SYSTEM.TotalPages}}</span></div>';
  }

  onSelectExistingTemplate(templateId: number | null): void {
    if (!templateId) {
      this.currentTemplateId.set(null);
      this.templateName = 'New TMS Paginated Report';
      this.selectedFields.set([]);
      this.runtimeFilters.set([]);
      this.selectedRoleConstraints.set({});
      this.initializeBlankDocumentSurface();
      this.refreshReachabilityAndSql();
      return;
    }
    this.loadTemplateIntoDesigner(templateId);
  }

  loadTemplateIntoDesigner(templateId: number): void {
    this.reportApi.getTemplateById(templateId).subscribe({
      next: (tpl) => {
        this.currentTemplateId.set(tpl.templateId);
        this.templateName = tpl.templateName;
        this.templateDescription = tpl.description ?? '';
        this.documentMode = tpl.documentMode || 'SingleOrBatchDocument';
        this.compiledSqlPreview.set(tpl.compiledSelectQuery);

        try {
          const layout: LayoutDocumentDto = JSON.parse(tpl.layoutJson);
          if (layout.pageSetup) this.pageSetup = { ...this.pageSetup, ...layout.pageSetup };
          if (layout.watermark) this.watermark = { ...this.watermark, ...layout.watermark };
          this.showGridlines = layout.showGridlines ?? true;
          this.headerEditorRef.nativeElement.innerHTML = layout.headerHtml || '';
          this.bodyEditorRef.nativeElement.innerHTML = layout.bodyHtml || '';
          this.footerEditorRef.nativeElement.innerHTML = layout.footerHtml || '';
        } catch {}

        try {
          const meta: QueryMetadataDto = JSON.parse(tpl.queryMetadataJson);
          this.selectedFields.set(meta.selectedFields ?? []);
          this.runtimeFilters.set(meta.filterConfig ?? []);
          this.selectedRoleConstraints.set(meta.selectedRoleConstraints ?? {});
          this.resolvedJoinPath.set(meta.joinPath ?? []);
        } catch {}

        this.refreshReachabilityAndSql();
      }
    });
  }

  // ==================== MS WORD RIBBON COMMANDS ====================

  execCmd(command: string, value?: string): void {
    document.execCommand(command, false, value);
    this.syncCanvasState();
  }

  pastePlainText(): void {
    navigator.clipboard?.readText().then((text) => {
      if (text) this.insertTextAtCursor(text);
    });
  }

  toggleFormatPainter(): void {
    if (this.formatPainterActive()) {
      this.formatPainterActive.set(false);
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const parentEl = sel.anchorNode?.parentElement;
      if (parentEl) {
        const computedStyle = window.getComputedStyle(parentEl);
        this.copiedInlineStyle = `font-family:${computedStyle.fontFamily};font-size:${computedStyle.fontSize};font-weight:${computedStyle.fontWeight};font-style:${computedStyle.fontStyle};color:${computedStyle.color};background-color:${computedStyle.backgroundColor};`;
        this.formatPainterActive.set(true);
        this.flashToast('Format Painter active — select target text to apply formatting');
      }
    }
  }

  onEditorMouseUp(): void {
    this.detectActiveTableFromSelection();

    if (this.formatPainterActive() && this.copiedInlineStyle) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const text = sel.toString();
        document.execCommand(
          'insertHTML',
          false,
          `<span style="${this.copiedInlineStyle}">${text}</span>`
        );
        this.formatPainterActive.set(false);
      }
    }
  }

  runFindAndReplace(): void {
    if (!this.findText) return;
    const escaped = this.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    this.bodyEditorRef.nativeElement.innerHTML =
      this.bodyEditorRef.nativeElement.innerHTML.replace(regex, this.replaceText);
    this.flashToast(`Replaced occurrences of "${this.findText}"`);
    this.syncCanvasState();
  }

  applyFontFamily(font: string): void {
    this.selectedFontFamily = font;
    this.execCmd('fontName', font);
  }

  applyFontSizePt(sizePt: number): void {
    this.selectedFontSizePt = sizePt;
    this.wrapCurrentSelectionWithStyle(`font-size:${sizePt}pt;`);
  }

  stepFontSize(deltaPt: number): void {
    const next = Math.max(8, Math.min(72, this.selectedFontSizePt + deltaPt));
    this.applyFontSizePt(next);
  }

  applyUnderlineStyle(style: string): void {
    if (!style) {
      this.execCmd('underline');
      return;
    }
    this.wrapCurrentSelectionWithStyle(`text-decoration: underline ${style};`);
  }

  changeSelectedCase(mode: string): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const raw = sel.toString();
    let transformed = raw;
    if (mode === 'upper') transformed = raw.toUpperCase();
    else if (mode === 'lower') transformed = raw.toLowerCase();
    else if (mode === 'title') {
      transformed = raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    } else if (mode === 'sentence') {
      transformed = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
    document.execCommand('insertText', false, transformed);
  }

  applyTextColor(color: string): void {
    this.textColor = color;
    this.execCmd('foreColor', color);
  }

  applyHighlightColor(color: string): void {
    this.highlightColor = color;
    this.execCmd('hiliteColor', color);
  }

  applyBulletListStyle(listStyleType: string): void {
    if (!listStyleType) return;
    this.execCmd('insertUnorderedList');
    const sel = window.getSelection();
    const ul = sel?.anchorNode?.parentElement?.closest('ul');
    if (ul) (ul as HTMLElement).style.listStyleType = listStyleType;
  }

  applyNumberedListStyle(listStyleType: string): void {
    if (!listStyleType) return;
    this.execCmd('insertOrderedList');
    const sel = window.getSelection();
    const ol = sel?.anchorNode?.parentElement?.closest('ol');
    if (ol) (ol as HTMLElement).style.listStyleType = listStyleType;
  }

  applyLineSpacing(lineHeight: string): void {
    const block = this.getCurrentBlockElement();
    if (block) {
      block.style.lineHeight = lineHeight;
    }
  }

  applyParagraphShading(bgColor: string): void {
    const block = this.getCurrentBlockElement();
    if (block) {
      block.style.backgroundColor = bgColor;
      block.style.padding = '6px 10px';
    }
  }

  toggleParagraphBorder(): void {
    const block = this.getCurrentBlockElement();
    if (block) {
      block.style.border = block.style.border ? '' : '1px solid #334155';
      block.style.padding = '6px 10px';
    }
  }

  applyQuickHeadingStyle(styleCode: string): void {
    if (!styleCode) return;
    if (styleCode === 'TITLE') {
      document.execCommand(
        'insertHTML',
        false,
        `<h1 style="font-size:22pt;color:#1e3a8a;margin:8px 0;">${window.getSelection()?.toString() || 'Document Title'}</h1>`
      );
    } else if (styleCode === 'SUBTITLE') {
      document.execCommand(
        'insertHTML',
        false,
        `<h3 style="font-size:14pt;color:#475569;font-weight:500;margin:6px 0;">${window.getSelection()?.toString() || 'Subtitle'}</h3>`
      );
    } else if (styleCode === 'QUOTE') {
      document.execCommand(
        'insertHTML',
        false,
        `<blockquote style="border-left:4px solid #2563eb;padding-left:12px;color:#334155;font-style:italic;margin:10px 0;">${window.getSelection()?.toString() || 'Quote text'}</blockquote>`
      );
    } else {
      this.execCmd('formatBlock', `<${styleCode}>`);
    }
  }

  // ==================== INSERT TAB COMMANDS ====================

  insertTable(rows: number, cols: number, isRepeaterTable: boolean): void {
    const rCount = Math.max(1, Math.min(30, rows || 3));
    const cCount = Math.max(1, Math.min(15, cols || 4));
    const tblName = this.anchorTable() || 'RepeaterTable';

    let html = '<table style="width:100%;border-collapse:collapse;margin:12px 0;" border="1"><thead><tr data-repeat-header="true" style="background:#1e3a8a;color:#ffffff;">';
    for (let c = 1; c <= cCount; c++) {
      html += `<th style="padding:8px;border:1px solid #cbd5e1;">Column ${c}</th>`;
    }
    html += '</tr></thead><tbody>';

    const bodyRows = isRepeaterTable ? 1 : Math.max(1, rCount - 1);
    for (let r = 0; r < bodyRows; r++) {
      const repAttr = isRepeaterTable ? ` data-repeater="true" data-repeater-table="${tblName}"` : '';
      html += `<tr${repAttr}>`;
      for (let c = 1; c <= cCount; c++) {
        html += `<td style="padding:8px;border:1px solid #cbd5e1;">${isRepeaterTable ? 'Drop field here' : '&nbsp;'}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table><p></p>';

    this.insertHtmlIntoActiveEditor(html);
  }

  onUploadLocalImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      this.insertHtmlIntoActiveEditor(
        `<img src="${dataUrl}" alt="${file.name}" style="max-width:220px;height:auto;display:inline-block;margin:6px;" />`
      );
    };
    reader.readAsDataURL(file);
  }

  insertImageByUrl(): void {
    const url = window.prompt('Enter Image or Logo URL:', 'https://via.placeholder.com/180x60?text=COMPANY+LOGO');
    if (url) {
      this.insertHtmlIntoActiveEditor(
        `<img src="${url}" alt="Inserted Image" style="max-width:220px;height:auto;display:inline-block;margin:6px;" />`
      );
    }
  }

  insertHorizontalDivider(): void {
    this.insertHtmlIntoActiveEditor('<hr style="border:none;border-top:2px solid #cbd5e1;margin:12px 0;" />');
  }

  insertCalloutBox(): void {
    this.insertHtmlIntoActiveEditor(
      '<div class="word-callout" style="border:1px solid #60a5fa;background:#eff6ff;padding:12px;border-radius:6px;margin:10px 0;"><strong>Callout / Note:</strong> Enter important summary remarks or merge tags here.</div><p></p>'
    );
  }

  insertSignatureLine(): void {
    this.insertHtmlIntoActiveEditor(
      '<div class="word-signature-line" style="display:flex;justify-content:space-between;margin-top:32px;"><div style="border-top:1px solid #0f172a;width:200px;padding-top:4px;font-size:10pt;">Authorized Signatory</div><div style="border-top:1px solid #0f172a;width:200px;padding-top:4px;font-size:10pt;">Receiver Signature &amp; Date</div></div><p></p>'
    );
  }

  insertHyperlink(): void {
    const url = window.prompt('Enter Hyperlink URL:', 'https://');
    if (url) {
      this.execCmd('createLink', url);
    }
  }

  focusRegion(region: 'header' | 'footer'): void {
    this.activeEditorRegion.set(region);
    if (region === 'header') this.headerEditorRef.nativeElement.focus();
    else this.footerEditorRef.nativeElement.focus();
  }

  insertSystemToken(tokenName: string): void {
    if (tokenName === 'PageNumber') {
      this.insertHtmlIntoActiveEditor('<span>Page {{SYSTEM.PageNumber}} of {{SYSTEM.TotalPages}}</span>');
    } else {
      this.insertHtmlIntoActiveEditor(`<span>{{SYSTEM.${tokenName}}}</span>`);
    }
  }

  insertPageBreak(): void {
    this.insertHtmlIntoActiveEditor(
      '<div class="explicit-page-break" style="page-break-after:always;break-after:page;border-top:2px dashed #94a3b8;text-align:center;font-size:9pt;color:#64748b;margin:16px 0;padding-top:4px;">--- PAGE BREAK ---</div><p></p>'
    );
  }

  insertSectionBreak(): void {
    this.insertHtmlIntoActiveEditor(
      '<div class="section-break" style="border-top:3px double #64748b;text-align:center;font-size:9pt;color:#475569;margin:16px 0;padding-top:4px;">=== SECTION BREAK ===</div><p></p>'
    );
  }

  insertTextAtCursor(text: string): void {
    this.insertHtmlIntoActiveEditor(text);
  }

  // ==================== CONTEXTUAL TABLE COMMANDS (WORD-06) ====================

  private detectActiveTableFromSelection(): void {
    const sel = window.getSelection();
    const anchorEl = sel?.anchorNode?.parentElement ?? null;
    const cell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
    const row = anchorEl?.closest('tr') as HTMLTableRowElement | null;
    const table = anchorEl?.closest('table') as HTMLTableElement | null;

    this.activeTableCellElement = cell;
    this.activeTableRowElement = row;
    this.activeTableElement = table;
    this.isCursorInTable.set(!!table);
  }

  tableInsertRow(position: 'above' | 'below'): void {
    if (!this.activeTableElement || !this.activeTableRowElement) return;
    const colCount = this.activeTableRowElement.cells.length || 1;
    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.style.padding = '8px';
      td.style.border = '1px solid #cbd5e1';
      td.innerHTML = '&nbsp;';
      newRow.appendChild(td);
    }
    if (position === 'above') {
      this.activeTableRowElement.parentNode?.insertBefore(newRow, this.activeTableRowElement);
    } else {
      this.activeTableRowElement.parentNode?.insertBefore(newRow, this.activeTableRowElement.nextSibling);
    }
    this.syncCanvasState();
  }

  tableInsertColumn(side: 'left' | 'right'): void {
    if (!this.activeTableElement || !this.activeTableCellElement) return;
    const colIndex = this.activeTableCellElement.cellIndex;
    const rows = Array.from(this.activeTableElement.rows);
    for (const row of rows) {
      const isHeader = row.parentElement?.tagName === 'THEAD';
      const cell = document.createElement(isHeader ? 'th' : 'td');
      cell.style.padding = '8px';
      cell.style.border = '1px solid #cbd5e1';
      cell.innerHTML = isHeader ? 'New Column' : '&nbsp;';
      const refCell = row.cells[colIndex];
      if (side === 'left') {
        row.insertBefore(cell, refCell);
      } else {
        row.insertBefore(cell, refCell ? refCell.nextSibling : null);
      }
    }
    this.syncCanvasState();
  }

  tableDeleteRow(): void {
    this.activeTableRowElement?.remove();
    this.syncCanvasState();
  }

  tableDeleteColumn(): void {
    if (!this.activeTableElement || !this.activeTableCellElement) return;
    const colIndex = this.activeTableCellElement.cellIndex;
    for (const row of Array.from(this.activeTableElement.rows)) {
      if (row.cells[colIndex]) row.deleteCell(colIndex);
    }
    this.syncCanvasState();
  }

  tableDeleteTable(): void {
    this.activeTableElement?.remove();
    this.isCursorInTable.set(false);
    this.syncCanvasState();
  }

  tableMergeWithNextCell(): void {
    if (!this.activeTableCellElement) return;
    const next = this.activeTableCellElement.nextElementSibling as HTMLTableCellElement | null;
    if (!next) return;
    this.activeTableCellElement.colSpan = (this.activeTableCellElement.colSpan || 1) + (next.colSpan || 1);
    this.activeTableCellElement.innerHTML += ' ' + next.innerHTML;
    next.remove();
    this.syncCanvasState();
  }

  tableSplitCurrentCell(): void {
    if (!this.activeTableCellElement || !this.activeTableRowElement) return;
    const currentSpan = this.activeTableCellElement.colSpan || 1;
    if (currentSpan > 1) {
      this.activeTableCellElement.colSpan = currentSpan - 1;
    }
    const newCell = document.createElement('td');
    newCell.style.padding = '8px';
    newCell.style.border = '1px solid #cbd5e1';
    newCell.innerHTML = '&nbsp;';
    this.activeTableRowElement.insertBefore(newCell, this.activeTableCellElement.nextSibling);
    this.syncCanvasState();
  }

  tableSetVerticalAlign(align: 'top' | 'middle' | 'bottom'): void {
    if (this.activeTableCellElement) {
      this.activeTableCellElement.style.verticalAlign = align;
      this.syncCanvasState();
    }
  }

  tableSetCellPadding(padding: string): void {
    if (!this.activeTableElement) return;
    this.activeTableElement.querySelectorAll('td, th').forEach((c) => {
      (c as HTMLElement).style.padding = padding;
    });
    this.syncCanvasState();
  }

  tableApplyCellShading(color: string): void {
    if (this.activeTableCellElement) {
      this.activeTableCellElement.style.backgroundColor = color;
      this.syncCanvasState();
    }
  }

  tableApplyBorders(): void {
    if (!this.activeTableElement) return;
    const borderCss =
      this.tableBorderStyle === 'none'
        ? 'none'
        : `${this.tableBorderWidthPx}px ${this.tableBorderStyle} ${this.tableBorderColor}`;
    this.activeTableElement.querySelectorAll('td, th').forEach((c) => {
      (c as HTMLElement).style.border = borderCss;
    });
    this.syncCanvasState();
  }

  tableToggleHeaderRepeat(): void {
    if (!this.activeTableRowElement) return;
    const current = this.activeTableRowElement.getAttribute('data-repeat-header') === 'true';
    if (current) {
      this.activeTableRowElement.removeAttribute('data-repeat-header');
    } else {
      this.activeTableRowElement.setAttribute('data-repeat-header', 'true');
    }
    this.flashToast(`Header Row Repeat across pages: ${!current ? 'ENABLED' : 'DISABLED'}`);
    this.syncCanvasState();
  }

  tableToggleRepeaterRow(): void {
    if (!this.activeTableRowElement) return;
    const current = this.activeTableRowElement.getAttribute('data-repeater') === 'true';
    if (current) {
      this.activeTableRowElement.removeAttribute('data-repeater');
      this.activeTableRowElement.removeAttribute('data-repeater-table');
    } else {
      this.activeTableRowElement.setAttribute('data-repeater', 'true');
      this.activeTableRowElement.setAttribute('data-repeater-table', this.anchorTable() || 'Repeater');
    }
    this.flashToast(`SQL Data Repeater Row: ${!current ? 'ENABLED' : 'DISABLED'}`);
    this.syncCanvasState();
  }

  tableAppendAggregateFooterRow(): void {
    if (!this.activeTableElement) return;
    const colCount = this.activeTableElement.rows[0]?.cells.length || 3;
    const tr = document.createElement('tr');
    tr.setAttribute('data-summary-footer', 'true');
    tr.style.background = '#f1f5f9';
    tr.style.fontWeight = '700';

    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.style.padding = '8px';
      td.style.border = '1px solid #cbd5e1';
      td.innerHTML = i === 0 ? 'Total / Count:' : 'Right-click a dropped field to set SUM / COUNT / AVG';
      tr.appendChild(td);
    }
    this.activeTableElement.querySelector('tbody')?.appendChild(tr);
    this.syncCanvasState();
  }

  // ==================== PAGE SETUP & VIEW COMMANDS ====================

  onPageSizeChange(size: PageSetupDto['pageSize']): void {
    this.pageSetup.pageSize = size;
    const dims: Record<string, [number, number]> = {
      A4: [210, 297],
      Letter: [215.9, 279.4],
      Legal: [215.9, 355.6],
      A3: [297, 420],
      A5: [148, 210]
    };
    if (dims[size]) {
      this.pageSetup.widthMm = dims[size][0];
      this.pageSetup.heightMm = dims[size][1];
    }
  }

  applyMarginPreset(preset: string): void {
    if (preset === 'normal') {
      this.pageSetup.marginTopMm = 20;
      this.pageSetup.marginBottomMm = 20;
      this.pageSetup.marginLeftMm = 20;
      this.pageSetup.marginRightMm = 20;
    } else if (preset === 'narrow') {
      this.pageSetup.marginTopMm = 12.7;
      this.pageSetup.marginBottomMm = 12.7;
      this.pageSetup.marginLeftMm = 12.7;
      this.pageSetup.marginRightMm = 12.7;
    } else if (preset === 'moderate') {
      this.pageSetup.marginTopMm = 25.4;
      this.pageSetup.marginBottomMm = 25.4;
      this.pageSetup.marginLeftMm = 19.1;
      this.pageSetup.marginRightMm = 19.1;
    } else if (preset === 'wide') {
      this.pageSetup.marginTopMm = 25.4;
      this.pageSetup.marginBottomMm = 25.4;
      this.pageSetup.marginLeftMm = 50.8;
      this.pageSetup.marginRightMm = 50.8;
    }
  }

  applyFirstLineIndent(mm: number): void {
    this.firstLineIndentMm.set(mm);
    const block = this.getCurrentBlockElement();
    if (block) {
      block.style.textIndent = `${mm}mm`;
    }
  }

  // ==================== DATABASE FIELD DRAG-AND-DROP & FK REACHABILITY ====================

  onFieldDragStart(event: DragEvent, field: CatalogColumnDto, isReachable: boolean): void {
    if (!isReachable) {
      event.preventDefault();
      return;
    }
    this.draggedField = field;
    event.dataTransfer?.setData('text/plain', `${field.tableName}.${field.columnName}`);
  }

  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    if (!this.draggedField) return;
    const field = this.draggedField;
    this.draggedField = null;
    this.tryBindFieldOntoCanvas(field);
  }

  onFieldClickInsert(field: CatalogColumnDto, isReachable: boolean): void {
    if (!isReachable) return;
    this.tryBindFieldOntoCanvas(field);
  }

  private tryBindFieldOntoCanvas(field: CatalogColumnDto): void {
    const reach = this.reachabilityState();
    const tblDetail = reach?.tableDetails?.[field.tableName];

    // If multiple FKs connect the anchor/active tables to this target table, prompt for Role Disambiguation (BIND-02)
    if (
      this.anchorTable() &&
      this.anchorTable() !== field.tableName &&
      tblDetail?.requiresRoleDisambiguation &&
      tblDetail.availableRoles.length > 1
    ) {
      this.pendingRoleDrop.set({
        field,
        roles: tblDetail.availableRoles
      });
      return;
    }

    this.completeFieldInsertion(field, null);
  }

  confirmRoleSelection(role: RoleOptionDto): void {
    const pending = this.pendingRoleDrop();
    if (!pending) return;
    this.pendingRoleDrop.set(null);

    const updatedRoles = {
      ...this.selectedRoleConstraints(),
      [`${role.fromTable}->${role.toTable}`]: role.constraintName,
      [role.toTable]: role.constraintName
    };
    this.selectedRoleConstraints.set(updatedRoles);

    this.completeFieldInsertion(pending.field, role);
  }

  cancelRoleSelection(): void {
    this.pendingRoleDrop.set(null);
  }

  private completeFieldInsertion(field: CatalogColumnDto, role: RoleOptionDto | null): void {
    const tableAlias = role ? role.suggestedAlias : field.tableName;
    const colSqlAlias = `${tableAlias}_${field.columnName}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const rolePrefix = role ? `${role.roleLabel}: ` : '';
    const displayLabel = `${rolePrefix}${field.displayName}`;

    // Check if cursor is inside a repeating table row (<tr data-repeater="true">)
    const isRepeater =
      this.activeTableRowElement?.getAttribute('data-repeater') === 'true';
    if (isRepeater && this.activeTableRowElement) {
      this.activeTableRowElement.setAttribute('data-repeater-table', tableAlias);
    }

    const spanHtml = `<span class="merge-tag" contenteditable="false" data-table="${field.tableName}" data-column="${field.columnName}" data-alias="${colSqlAlias}" data-table-alias="${tableAlias}" data-format="" data-transform="" data-aggregate="NONE" data-null-default="">{{${tableAlias}.${displayLabel}}}</span>&nbsp;`;

    this.insertHtmlIntoActiveEditor(spanHtml);

    const newSelected: SelectedFieldDto = {
      fieldId: field.fieldId,
      schemaName: field.schemaName,
      tableName: field.tableName,
      columnName: field.columnName,
      tableAlias,
      columnSqlAlias: colSqlAlias,
      displayName: displayLabel,
      dataType: field.dataType,
      AggregateFunction: 'NONE',
      aggregateFunction: 'NONE',
      isRepeaterField: isRepeater,
      repeaterTableName: isRepeater ? tableAlias : null,
      roleConstraintName: role?.constraintName ?? null,
      roleLabel: role?.roleLabel ?? null
    } as SelectedFieldDto;

    this.selectedFields.update((curr) => [...curr, newSelected]);
    this.refreshReachabilityAndSql();
  }

  // ==================== RIGHT-CLICK INLINE FIELD FORMATTING (BIND-04) ====================

  onCanvasRightClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement)?.closest('.merge-tag') as HTMLElement | null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    this.formattingTargetTag.set({
      element: target,
      label: target.innerText,
      x: Math.min(window.innerWidth - 310, event.clientX),
      y: Math.min(window.innerHeight - 320, event.clientY),
      formatString: target.getAttribute('data-format') || '',
      textTransform: target.getAttribute('data-transform') || '',
      aggregateFunction: target.getAttribute('data-aggregate') || 'NONE',
      nullDefaultValue: target.getAttribute('data-null-default') || ''
    });
  }

  applyFieldFormatting(): void {
    const target = this.formattingTargetTag();
    if (!target) return;

    target.element.setAttribute('data-format', target.formatString);
    target.element.setAttribute('data-transform', target.textTransform);
    target.element.setAttribute('data-aggregate', target.aggregateFunction);
    target.element.setAttribute('data-null-default', target.nullDefaultValue);

    const alias = target.element.getAttribute('data-alias');
    if (alias) {
      this.selectedFields.update((fields) =>
        fields.map((f) =>
          f.columnSqlAlias === alias
            ? {
                ...f,
                formatString: target.formatString || null,
                textTransform: target.textTransform || null,
                aggregateFunction: target.aggregateFunction || 'NONE',
                nullDefaultValue: target.nullDefaultValue || null
              }
            : f
        )
      );
    }

    this.formattingTargetTag.set(null);
    this.flashToast('Applied field display & aggregate formatting');
    this.refreshSqlCompilation();
  }

  deleteFormattedMergeTag(): void {
    const target = this.formattingTargetTag();
    if (!target) return;
    target.element.remove();
    this.formattingTargetTag.set(null);
    this.syncCanvasState();
  }

  closeContextMenus(): void {
    if (this.formattingTargetTag()) {
      this.formattingTargetTag.set(null);
    }
  }

  resetCanvasFields(): void {
    this.headerEditorRef.nativeElement.querySelectorAll('.merge-tag').forEach((el) => el.remove());
    this.bodyEditorRef.nativeElement.querySelectorAll('.merge-tag').forEach((el) => el.remove());
    this.footerEditorRef.nativeElement.querySelectorAll('.merge-tag').forEach((el) => el.remove());
    this.selectedFields.set([]);
    this.runtimeFilters.set([]);
    this.selectedRoleConstraints.set({});
    this.refreshReachabilityAndSql();
    this.flashToast('All database fields removed — Sidebar reset to Zero-State (All tables unlocked)');
  }

  // ==================== RUNTIME FILTER BUILDER (BIND-05) ====================

  addFilterFromField(field: CatalogColumnDto): void {
    const uiControl = this.autoMapUiControlType(field.dataType, '=');
    const newFilter: RuntimeFilterConfigDto = {
      filterId: `flt_${Date.now().toString(36)}`,
      fieldId: field.fieldId,
      schemaName: field.schemaName,
      tableName: field.tableName,
      columnName: field.columnName,
      tableAlias: field.tableName,
      filterLabel: field.displayName,
      dataType: field.dataType,
      operator: '=',
      uiControlType: uiControl,
      isRequired: false,
      defaultValue: ''
    };
    this.runtimeFilters.update((curr) => [...curr, newFilter]);
    this.sidebarTab.set('filters');
    this.refreshReachabilityAndSql();
    this.flashToast(`Added runtime filter "${field.displayName}"`);
  }

  onSelectFieldForNewFilter(tableDotCol: string): void {
    if (!tableDotCol) return;
    const match = this.reachablePublishedFields().find(
      (f) => `${f.tableName}.${f.columnName}` === tableDotCol
    );
    if (match) {
      this.addFilterFromField(match);
    }
  }

  onFilterOperatorChange(flt: RuntimeFilterConfigDto): void {
    flt.uiControlType = this.autoMapUiControlType(flt.dataType, flt.operator);
    this.refreshSqlCompilation();
  }

  removeRuntimeFilter(filterId: string): void {
    this.runtimeFilters.update((curr) => curr.filter((f) => f.filterId !== filterId));
    this.refreshReachabilityAndSql();
  }

  private autoMapUiControlType(sqlDataType: string, operator: string): string {
    const dt = (sqlDataType || 'varchar').toLowerCase();
    if (operator === 'IN') return 'MultiSelect';
    if (dt.includes('date') || dt.includes('time')) {
      return operator === 'BETWEEN' ? 'DateRangePicker' : 'DatePicker';
    }
    if (dt.includes('int') || dt.includes('decimal') || dt.includes('numeric') || dt.includes('money') || dt.includes('float')) {
      return 'NumberInput';
    }
    if (dt.includes('bit')) return 'Checkbox';
    return 'Dropdown';
  }

  // ==================== SYNC & SQL COMPILATION ====================

  syncCanvasState(): void {
    // Reconcile selectedFields with merge-tag spans still present in Header/Body/Footer DOM
    const allTagEls = [
      ...Array.from(this.headerEditorRef.nativeElement.querySelectorAll('.merge-tag')),
      ...Array.from(this.bodyEditorRef.nativeElement.querySelectorAll('.merge-tag')),
      ...Array.from(this.footerEditorRef.nativeElement.querySelectorAll('.merge-tag'))
    ];

    if (allTagEls.length === 0 && this.selectedFields().length > 0) {
      this.selectedFields.set([]);
      this.refreshReachabilityAndSql();
      return;
    }

    const activeAliases = new Set(
      allTagEls.map((el) => el.getAttribute('data-alias') || '').filter(Boolean)
    );
    const current = this.selectedFields();
    const filtered = current.filter((f) => activeAliases.has(f.columnSqlAlias));
    if (filtered.length !== current.length) {
      this.selectedFields.set(filtered);
      this.refreshReachabilityAndSql();
    }
  }

  refreshReachabilityAndSql(): void {
    const activeTables: string[] = [];
    for (const f of this.selectedFields()) {
      if (f.tableName && !activeTables.includes(f.tableName)) {
        activeTables.push(f.tableName);
      }
    }
    for (const flt of this.runtimeFilters()) {
      if (flt.tableName && !activeTables.includes(flt.tableName)) {
        activeTables.push(flt.tableName);
      }
    }

    this.reportApi
      .computeReachability(activeTables, this.selectedRoleConstraints())
      .subscribe({
        next: (reach) => {
          this.reachabilityState.set(reach);
          this.resolvedJoinPath.set(reach.resolvedJoinPath ?? []);
          this.refreshSqlCompilation();
        }
      });
  }

  refreshSqlCompilation(): void {
    const metadata = this.buildQueryMetadataPayload();
    this.reportApi.compilePreview(metadata).subscribe({
      next: (res) => {
        this.compiledSqlPreview.set(res.compiledSelectQuery);
        this.resolvedJoinPath.set(res.resolvedJoinPath ?? []);
      }
    });
  }

  saveTemplate(onSavedCallback?: (saved: SavedReportTemplateDto) => void): void {
    this.saving.set(true);
    const payload = {
      templateId: this.currentTemplateId(),
      templateName: this.templateName || 'Untitled Report Template',
      description: this.templateDescription,
      anchorTableName: this.anchorTable(),
      documentMode: this.documentMode,
      layout: this.buildLayoutPayload(),
      queryMetadata: this.buildQueryMetadataPayload()
    };

    this.reportApi.saveTemplate(payload).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.currentTemplateId.set(saved.templateId);
        this.compiledSqlPreview.set(saved.compiledSelectQuery);
        this.flashToast(`Saved template #${saved.templateId} ("${saved.templateName}")`);
        this.reportApi.getTemplates().subscribe({
          next: (list) => this.savedTemplates.set(list)
        });
        if (onSavedCallback) onSavedCallback(saved);
      },
      error: () => {
        this.saving.set(false);
      }
    });
  }

  saveAndRunReport(): void {
    this.saveTemplate((saved) => {
      this.router.navigate(['/reports/run', saved.templateId]);
    });
  }

  private buildLayoutPayload(): LayoutDocumentDto {
    return {
      pageSetup: { ...this.pageSetup },
      watermark: { ...this.watermark },
      headerHtml: this.headerEditorRef.nativeElement.innerHTML,
      bodyHtml: this.bodyEditorRef.nativeElement.innerHTML,
      footerHtml: this.footerEditorRef.nativeElement.innerHTML,
      showGridlines: this.showGridlines
    };
  }

  private buildQueryMetadataPayload(): QueryMetadataDto {
    return {
      anchorTable: this.anchorTable(),
      documentMode: this.documentMode,
      selectedFields: this.selectedFields(),
      joinPath: this.resolvedJoinPath(),
      filterConfig: this.runtimeFilters(),
      selectedRoleConstraints: this.selectedRoleConstraints()
    };
  }

  private insertHtmlIntoActiveEditor(html: string): void {
    const region = this.activeEditorRegion();
    const targetEl =
      region === 'header'
        ? this.headerEditorRef.nativeElement
        : region === 'footer'
          ? this.footerEditorRef.nativeElement
          : this.bodyEditorRef.nativeElement;

    targetEl.focus();
    document.execCommand('insertHTML', false, html);
    this.syncCanvasState();
  }

  private wrapCurrentSelectionWithStyle(cssText: string): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    document.execCommand('insertHTML', false, `<span style="${cssText}">${text}</span>`);
    this.syncCanvasState();
  }

  private getCurrentBlockElement(): HTMLElement | null {
    const sel = window.getSelection();
    return (sel?.anchorNode?.parentElement?.closest('p, div, h1, h2, h3, h4, h5, h6, li, blockquote') as HTMLElement) ?? null;
  }

  private flashToast(msg: string): void {
    this.statusToast.set(msg);
    setTimeout(() => {
      if (this.statusToast() === msg) this.statusToast.set('');
    }, 4000);
  }
}

