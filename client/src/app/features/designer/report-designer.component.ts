import {
  Component,
  ElementRef,
  OnDestroy,
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
    <div
      class="designer-root"
      [class.fullscreen-mode]="isFullScreen()"
      (click)="closeContextMenus()"
      (wheel)="onCanvasWheelZoom($event)"
    >
      <!-- Top MS Word 365 Title & Template Command Bar (Hidden in Full Screen Mode so ONLY Ribbon + Page + Fields show) -->
      @if (!isFullScreen()) {
        <div class="template-bar">
          <div class="template-meta">
            <span class="word-app-badge" title="Microsoft Word-Style Report Designer">W</span>
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
            <button
              class="btn-window-mode"
              (click)="isRightSidebarOpen.set(!isRightSidebarOpen())"
              title="Show or Hide Right Database Fields Panel"
            >
              {{ isRightSidebarOpen() ? '◨ Hide Fields Panel' : '◧ Show Fields Panel' }}
            </button>
            <button
              class="btn-fullscreen-toggle"
              [class.active-fs]="isFullScreen()"
              (click)="toggleFullScreen()"
              title="Full Screen Mode (Shows ONLY Word Ribbon, Page & Side Field Section)"
            >
              ⛶ Full Screen Mode
            </button>
            <button class="btn-sql-toggle" (click)="showSqlDrawer.set(!showSqlDrawer())">
              {{ showSqlDrawer() ? 'Hide SQL' : '⚡ Auto-SQL' }}
            </button>
            <button class="btn-save" (click)="saveTemplate()" [disabled]="saving()">
              💾 {{ currentTemplateId() ? 'Update' : 'Save' }}
            </button>
            <button class="btn-run" (click)="saveAndRunReport()" [disabled]="saving()">
              ▶ Run &amp; Export
            </button>
          </div>
        </div>
      }

      <!-- Modern Microsoft Word 365 Fluent Ribbon -->
      <div class="word-ribbon">
        <div class="ribbon-tabs-row">
          <div class="ribbon-tabs">
            <button [class.active]="ribbonTab() === 'home'" (click)="ribbonTab.set('home'); isRibbonCollapsed.set(false)">Home</button>
            <button [class.active]="ribbonTab() === 'insert'" (click)="ribbonTab.set('insert'); isRibbonCollapsed.set(false)">Insert</button>
            <button [class.active]="ribbonTab() === 'layout'" (click)="ribbonTab.set('layout'); isRibbonCollapsed.set(false)">Layout</button>
            <button [class.active]="ribbonTab() === 'view'" (click)="ribbonTab.set('view'); isRibbonCollapsed.set(false)">View</button>
            <button
              [class.active]="ribbonTab() === 'table'"
              [class.contextual-tab]="isCursorInTable()"
              (click)="ribbonTab.set('table'); isRibbonCollapsed.set(false)"
            >
              Table Design &amp; Layout {{ isCursorInTable() ? '●' : '' }}
            </button>
            <button
              [class.active]="ribbonTab() === 'object'"
              [class.contextual-tab]="hasSelectedObject()"
              (click)="ribbonTab.set('object'); isRibbonCollapsed.set(false)"
            >
              🔄 Shape &amp; Object Format (Rotate / Size) {{ hasSelectedObject() ? '●' : '' }}
            </button>
          </div>

          <div class="ribbon-right-quick">
            @if (statusToast() && isFullScreen()) {
              <span class="save-toast">{{ statusToast() }}</span>
            }
            <button class="quick-zoom-btn" (click)="zoomPercent.set(Math.max(40, zoomPercent() - 10))" title="Zoom Out Page">−</button>
            <span class="quick-zoom-lbl" (click)="zoomPercent.set(80)" title="Touchpad Pinch or Click to Reset Page Zoom (80%)">{{ zoomPercent() }}%</span>
            <button class="quick-zoom-btn" (click)="zoomPercent.set(Math.min(220, zoomPercent() + 10))" title="Zoom In Page">+</button>
            <button class="quick-zoom-btn" (click)="zoomPercent.set(75)" title="Fit Page to Screen">Fit Page</button>
            <button
              class="quick-zoom-btn"
              (click)="isRightSidebarOpen.set(!isRightSidebarOpen())"
              title="Show or Hide Right Fields Section"
            >
              {{ isRightSidebarOpen() ? '◨ Fields' : '◧ Fields' }}
            </button>
            @if (isFullScreen()) {
              <button class="quick-save-btn" (click)="saveTemplate()" [disabled]="saving()">💾 Save</button>
              <button class="quick-run-btn" (click)="saveAndRunReport()" [disabled]="saving()">▶ Run</button>
            }
            <button
              class="quick-fs-btn"
              [class.active-fs]="isFullScreen()"
              (click)="toggleFullScreen()"
              title="Toggle Full Screen (Shows ONLY Ribbon, Page & Side Field Section) or Reduce"
            >
              {{ isFullScreen() ? '🗗 Reduce (Exit Full Screen)' : '⛶ Full Screen' }}
            </button>
            <button
              class="btn-collapse-ribbon"
              (click)="isRibbonCollapsed.set(!isRibbonCollapsed())"
              [title]="isRibbonCollapsed() ? 'Expand Ribbon' : 'Collapse Ribbon'"
            >
              {{ isRibbonCollapsed() ? '⌄ Expand' : '⌃' }}
            </button>
          </div>
        </div>

        @if (!isRibbonCollapsed()) {
        <div class="ribbon-body">
          <!-- TAB 1: HOME (Clipboard, Typography, Styles, Paragraph & Lists) -->
          @if (ribbonTab() === 'home') {
            <div class="ribbon-group">
              <div class="group-controls">
                <button title="Undo (Ctrl+Z)" (click)="execCmd('undo')">↩ Undo</button>
                <button title="Redo (Ctrl+Y)" (click)="execCmd('redo')">↪ Redo</button>
                <button title="Cut" (click)="execCmd('cut')">✂ Cut</button>
                <button title="Copy" (click)="execCmd('copy')">📋 Copy</button>
                <button title="Paste Plain Text or Copied Tag" (click)="pastePlainText()">📄 Paste</button>
                @if (lastCopiedField(); as copiedFld) {
                  <button
                    class="btn-accent"
                    [title]="'Insert copied field: ' + copiedFld.displayName"
                    (click)="pasteCopiedFieldTag()"
                  >
                    🏷 Paste {{ copiedFld.displayName }}
                  </button>
                }
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
              <div class="group-label">Clipboard</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <select class="font-family-select" [ngModel]="selectedFontFamily" (ngModelChange)="applyFontFamily($event)" title="Font Family">
                  @for (f of fontFamilies; track f) {
                    <option [value]="f">{{ f }}</option>
                  }
                </select>
                <select class="font-size-select" [ngModel]="selectedFontSizePt" (ngModelChange)="applyFontSizePt($event)" title="Font Size (pt)">
                  @for (sz of fontSizesPt; track sz) {
                    <option [ngValue]="sz">{{ sz }}</option>
                  }
                </select>
                <button title="Increase Font Size" (click)="stepFontSize(2)">A▲</button>
                <button title="Decrease Font Size" (click)="stepFontSize(-2)">A▼</button>
                <span class="ctrl-sep"></span>
                <button class="icon-btn" title="Bold (Ctrl+B)" (click)="execCmd('bold')"><b>B</b></button>
                <button class="icon-btn" title="Italic (Ctrl+I)" (click)="execCmd('italic')"><i>I</i></button>
                <select (change)="applyUnderlineStyle($any($event.target).value)" title="Underline Style">
                  <option value="">U̲</option>
                  <option value="single">Single U̲</option>
                  <option value="double">Double U̳</option>
                  <option value="dotted">Dotted Ṳ</option>
                </select>
                <button class="icon-btn" title="Strikethrough" (click)="execCmd('strikeThrough')"><s>ab</s></button>
                <button class="icon-btn" title="Subscript" (click)="execCmd('subscript')">X₂</button>
                <button class="icon-btn" title="Superscript" (click)="execCmd('superscript')">X²</button>
                <select (change)="changeSelectedCase($any($event.target).value); $any($event.target).value=''" title="Change Case">
                  <option value="">Aa</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="lower">lowercase</option>
                  <option value="title">Title Case</option>
                  <option value="sentence">Sentence case</option>
                </select>
                <label class="color-picker-btn" title="Font Text Color">
                  <span class="color-letter" [style.borderBottomColor]="textColor">A</span>
                  <input type="color" [ngModel]="textColor" (ngModelChange)="applyTextColor($event)" />
                </label>
                <label class="color-picker-btn" title="Text Highlight Color">
                  🖍
                  <input type="color" [ngModel]="highlightColor" (ngModelChange)="applyHighlightColor($event)" />
                </label>
                <button title="Clear All Formatting" (click)="execCmd('removeFormat')">🧹</button>
              </div>
              <div class="group-label">Font</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="icon-btn" title="Align Left" (click)="execCmd('justifyLeft')">⬅</button>
                <button class="icon-btn" title="Align Center" (click)="execCmd('justifyCenter')">↔</button>
                <button class="icon-btn" title="Align Right" (click)="execCmd('justifyRight')">➡</button>
                <button class="icon-btn" title="Justify" (click)="execCmd('justifyFull')">☰</button>
                <span class="ctrl-sep"></span>
                <select (change)="applyBulletListStyle($any($event.target).value); $any($event.target).value=''" title="Bulleted List">
                  <option value="">• List</option>
                  <option value="disc">• Disc</option>
                  <option value="circle">○ Circle</option>
                  <option value="square">▪ Square</option>
                </select>
                <select (change)="applyNumberedListStyle($any($event.target).value); $any($event.target).value=''" title="Numbered List">
                  <option value="">1. List</option>
                  <option value="decimal">1, 2, 3</option>
                  <option value="lower-alpha">a, b, c</option>
                  <option value="lower-roman">i, ii, iii</option>
                </select>
                <button class="icon-btn" title="Decrease Indent" (click)="execCmd('outdent')">⇤</button>
                <button class="icon-btn" title="Increase Indent" (click)="execCmd('indent')">⇥</button>
                <select (change)="applyLineSpacing($any($event.target).value)" title="Line Spacing">
                  <option value="1.15">↕ 1.15</option>
                  <option value="1.0">↕ 1.0</option>
                  <option value="1.5">↕ 1.5</option>
                  <option value="2.0">↕ 2.0</option>
                </select>
                <label class="color-picker-btn" title="Paragraph Shading Fill">
                  🪣
                  <input type="color" value="#eff6ff" (change)="applyParagraphShading($any($event.target).value)" />
                </label>
                <button title="Toggle Paragraph Box Border" (click)="toggleParagraphBorder()">▭ Border</button>
              </div>
              <div class="group-label">Paragraph</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="insertTextBox('inline')" title="Insert Editable Word Text Box">
                  🗔 +Text Box
                </button>
                <select (change)="applyQuickHeadingStyle($any($event.target).value); $any($event.target).value=''" title="Quick Styles Gallery">
                  <option value="">Styles Gallery...</option>
                  <option value="P">Normal</option>
                  <option value="TITLE">Title (22pt)</option>
                  <option value="SUBTITLE">Subtitle (14pt)</option>
                  <option value="H1">Heading 1</option>
                  <option value="H2">Heading 2</option>
                  <option value="H3">Heading 3</option>
                  <option value="H4">Heading 4</option>
                  <option value="QUOTE">Quote</option>
                </select>
              </div>
              <div class="group-label">Styles &amp; Quick Box</div>
            </div>
          }

          <!-- TAB 2: INSERT -->
          @if (ribbonTab() === 'insert') {
            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  Rows <input type="number" min="1" max="30" [(ngModel)]="insertTableRows" style="width:42px;" />
                </label>
                <label class="inline-lbl">
                  Cols <input type="number" min="1" max="15" [(ngModel)]="insertTableCols" style="width:42px;" />
                </label>
                <button class="btn-accent" (click)="insertTable(insertTableRows, insertTableCols, false)">
                  ⊞ Static Table
                </button>
                <button class="btn-accent" (click)="insertTable(2, 4, true)">
                  🔁 SQL Repeater Table
                </button>
              </div>
              <div class="group-label">Tables</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="insertTextBox('inline')" title="Insert Resizable & Rotatable Word Text Box">
                  🗔 Text Box
                </button>
                <button class="btn-accent" (click)="insertTextBox('floating')" title="Insert Floating Draggable & Rotatable Text Box (Move Anywhere)">
                  📌 Floating Box (Free Move)
                </button>
                <button class="btn-accent" (click)="insertStampBadge()" title="Insert Rotatable Stamp / Seal (e.g. APPROVED / ORIGINAL)">
                  🏷 Rotated Stamp
                </button>
                <select (change)="insertShapePreset($any($event.target).value); $any($event.target).value=''" title="Insert Word Shape or Banner">
                  <option value="">⬛ Insert Shape...</option>
                  <option value="rectangle">▭ Rectangle Box</option>
                  <option value="rounded">▱ Rounded Banner Box</option>
                  <option value="circle">◯ Circle / Oval Badge</option>
                  <option value="warning">⚠ Warning / Alert Box</option>
                  <option value="callout">💬 Callout Note Box</option>
                </select>
              </div>
              <div class="group-label">Text Boxes, Stamps &amp; Shapes</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="file-upload-btn">
                  🖼 Logo / Image
                  <input type="file" accept="image/*" (change)="onUploadLocalImage($event)" hidden />
                </label>
                <button (click)="insertImageByUrl()">🌐 Image URL</button>
                <button (click)="insertHorizontalDivider()">― Divider</button>
                <button (click)="insertSignatureLine()">✍ Signature</button>
                <button (click)="insertHyperlink()">🔗 Link</button>
              </div>
              <div class="group-label">Pictures &amp; Lines</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="focusRegion('header')">⬆ Header</button>
                <button (click)="focusRegion('footer')">⬇ Footer</button>
                <button (click)="insertSystemToken('PageNumber')"># Page X of Y</button>
                <button (click)="insertSystemToken('CurrentDate')">📅 Date</button>
                <button (click)="insertSystemToken('CurrentTime')">⏰ Time</button>
                <button (click)="insertSystemToken('PrintedBy')">👤 Printed By</button>
              </div>
              <div class="group-label">Header, Footer &amp; Tokens</div>
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
                <button (click)="tableInsertRow('above')">⬆ Row Above</button>
                <button (click)="tableInsertRow('below')">⬇ Row Below</button>
                <button (click)="tableInsertColumn('left')">⬅ Col Left</button>
                <button (click)="tableInsertColumn('right')">➡ Col Right</button>
                <button class="btn-danger-lite" (click)="tableDeleteRow()">✖ Row</button>
                <button class="btn-danger-lite" (click)="tableDeleteColumn()">✖ Col</button>
                <button class="btn-danger-lite" (click)="tableDeleteTable()">🗑 Table</button>
              </div>
              <div class="group-label">Rows &amp; Columns</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="tableMergeWithNextCell()">⊞ Merge Right</button>
                <button (click)="tableSplitCurrentCell()">⊟ Split Cell</button>
                <button (click)="tableSetVerticalAlign('top')">⤒ Top</button>
                <button (click)="tableSetVerticalAlign('middle')">VMid</button>
                <button (click)="tableSetVerticalAlign('bottom')">⤓ Bottom</button>
                <select (change)="tableSetCellPadding($any($event.target).value)" title="Cell Padding">
                  <option value="8px">Pad: Normal</option>
                  <option value="4px">Pad: Compact</option>
                  <option value="12px">Pad: Wide</option>
                </select>
              </div>
              <div class="group-label">Merge &amp; Alignment</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="color-picker-btn">
                  🎨 Shading
                  <input type="color" [(ngModel)]="tableCellShadingColor" (ngModelChange)="tableApplyCellShading($event)" />
                </label>
                <select [(ngModel)]="tableBorderStyle" (ngModelChange)="tableApplyBorders()">
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="double">Double</option>
                  <option value="none">No Border</option>
                </select>
                <select [(ngModel)]="tableBorderWidthPx" (ngModelChange)="tableApplyBorders()">
                  <option [ngValue]="1">1 px</option>
                  <option [ngValue]="2">2 px</option>
                  <option [ngValue]="3">3 px</option>
                </select>
                <label class="color-picker-btn">
                  Border
                  <input type="color" [(ngModel)]="tableBorderColor" (ngModelChange)="tableApplyBorders()" />
                </label>
              </div>
              <div class="group-label">Borders &amp; Shading</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="tableToggleHeaderRepeat()">
                  📌 Repeat Header
                </button>
                <button class="btn-accent" (click)="tableToggleRepeaterRow()">
                  🔁 SQL Repeater Row
                </button>
                <button (click)="tableAppendAggregateFooterRow()">
                  ∑ Summary Footer Row
                </button>
              </div>
              <div class="group-label">SQL Data Binding</div>
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
                  <option value="Custom">Custom Size</option>
                </select>
                @if (pageSetup.pageSize === 'Custom') {
                  <label class="inline-lbl">
                    W <input type="number" [(ngModel)]="pageSetup.widthMm" style="width:50px;" />
                  </label>
                  <label class="inline-lbl">
                    H <input type="number" [(ngModel)]="pageSetup.heightMm" style="width:50px;" />
                  </label>
                }
                <select [(ngModel)]="pageSetup.orientation" title="Orientation">
                  <option value="Portrait">📄 Portrait</option>
                  <option value="Landscape">📃 Landscape</option>
                </select>
                <select (change)="applyMarginPreset($any($event.target).value)" title="Margins Preset">
                  <option value="normal">Margins: Normal (20mm)</option>
                  <option value="narrow">Narrow (12.7mm)</option>
                  <option value="moderate">Moderate (19/25mm)</option>
                  <option value="wide">Wide (25/50mm)</option>
                </select>
                <label class="inline-lbl" title="Top/Bottom/Left/Right Margins in mm">
                  T <input type="number" [(ngModel)]="pageSetup.marginTopMm" style="width:42px;" />
                  B <input type="number" [(ngModel)]="pageSetup.marginBottomMm" style="width:42px;" />
                  L <input type="number" [(ngModel)]="pageSetup.marginLeftMm" style="width:42px;" />
                  R <input type="number" [(ngModel)]="pageSetup.marginRightMm" style="width:42px;" />
                </label>
              </div>
              <div class="group-label">Page Setup (mm)</div>
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
                  <input type="checkbox" [(ngModel)]="watermark.enabled" /> Watermark
                </label>
                <select [(ngModel)]="watermark.type">
                  <option value="Text">Text</option>
                  <option value="Image">Image URL</option>
                </select>
                @if (watermark.type === 'Text') {
                  <input
                    type="text"
                    [(ngModel)]="watermark.text"
                    placeholder="CONFIDENTIAL"
                    style="width:115px;"
                  />
                  <input type="color" [(ngModel)]="watermark.color" title="Watermark Color" />
                } @else {
                  <input
                    type="text"
                    [(ngModel)]="watermark.imageUrl"
                    placeholder="Logo URL..."
                    style="width:140px;"
                  />
                }
                <select [(ngModel)]="watermark.rotationDeg" title="Watermark Orientation">
                  <option [ngValue]="-45">Diagonal (-45°)</option>
                  <option [ngValue]="0">Horizontal (0°)</option>
                </select>
              </div>
              <div class="group-label">Watermark</div>
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
                    step="5"
                    [ngModel]="zoomPercent()"
                    (ngModelChange)="zoomPercent.set($event)"
                  />
                </label>
                <button (click)="zoomPercent.set(75)">Fit Page (75%)</button>
                <button (click)="zoomPercent.set(85)">85%</button>
                <button (click)="zoomPercent.set(100)">100%</button>
                <button (click)="zoomPercent.set(115)">Fit Width</button>
              </div>
              <div class="group-label">Zoom</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  <input type="checkbox" [ngModel]="showRulers()" (ngModelChange)="showRulers.set($event)" />
                  Rulers (mm)
                </label>
                <label class="inline-lbl">
                  <input type="checkbox" [(ngModel)]="showGridlines" />
                  Table Gridlines
                </label>
                <label class="inline-lbl">
                  Indent (mm):
                  <input
                    type="number"
                    min="0"
                    max="60"
                    [ngModel]="firstLineIndentMm()"
                    (ngModelChange)="applyFirstLineIndent($event)"
                    style="width:46px;"
                  />
                </label>
              </div>
              <div class="group-label">Show</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="isFullScreen.set(!isFullScreen())">
                  {{ isFullScreen() ? '🗗 Reduce / Exit Full Screen' : '⛶ Full Screen Mode' }}
                </button>
                <button (click)="isRightSidebarOpen.set(!isRightSidebarOpen())">
                  {{ isRightSidebarOpen() ? '◨ Hide Fields Panel' : '◧ Show Fields Panel' }}
                </button>
              </div>
              <div class="group-label">Window</div>
            </div>
          }

          <!-- TAB 6: SHAPE & OBJECT FORMAT (Rotate, Resize, Float/Move, Fill & Border) -->
          @if (ribbonTab() === 'object') {
            <div class="ribbon-group">
              <div class="group-controls">
                <button class="btn-accent" (click)="insertTextBox('inline')">🗔 +Text Box</button>
                <button class="btn-accent" (click)="insertTextBox('floating')">📌 +Floating Box</button>
                <button class="btn-accent" (click)="insertStampBadge()">🏷 +Stamp</button>
              </div>
              <div class="group-label">Insert Object</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <button (click)="rotateSelectedObjectBy(-90)" title="Rotate Left 90°">↺ -90°</button>
                <button (click)="rotateSelectedObjectBy(-15)" title="Rotate Left 15°">↺ -15°</button>
                <button class="btn-accent" (click)="setSelectedObjectRotation(0)" title="Reset Rotation to 0°">0° Reset</button>
                <button (click)="rotateSelectedObjectBy(15)" title="Rotate Right 15°">↻ +15°</button>
                <button (click)="rotateSelectedObjectBy(90)" title="Rotate Right 90°">↻ +90°</button>
                <button (click)="rotateSelectedObjectBy(180)" title="Flip 180°">⇅ 180°</button>
                <label class="inline-lbl">
                  Angle:
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    [ngModel]="objRotationDeg()"
                    (ngModelChange)="setSelectedObjectRotation($event)"
                    style="width:80px;"
                  />
                  <input
                    type="number"
                    min="-360"
                    max="360"
                    [ngModel]="objRotationDeg()"
                    (ngModelChange)="setSelectedObjectRotation($event)"
                    style="width:52px;"
                  />°
                </label>
              </div>
              <div class="group-label">Rotate Object / Text Box / Image ({{ objRotationDeg() }}°)</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="inline-lbl">
                  W(px)
                  <input
                    type="number"
                    min="40"
                    max="800"
                    step="10"
                    [ngModel]="objWidthPx()"
                    (ngModelChange)="setSelectedObjectSize($event, objHeightPx())"
                    style="width:54px;"
                  />
                </label>
                <label class="inline-lbl">
                  H(px)
                  <input
                    type="number"
                    min="24"
                    max="800"
                    step="10"
                    [ngModel]="objHeightPx()"
                    (ngModelChange)="setSelectedObjectSize(objWidthPx(), $event)"
                    style="width:54px;"
                  />
                </label>
                <button (click)="toggleSelectedObjectFloating()" [class.active-tool]="objIsFloating()" title="Toggle Free Floating Position vs Inline">
                  {{ objIsFloating() ? '📌 Floating (Drag Handle)' : '📄 Inline' }}
                </button>
                <button (click)="nudgeSelectedObject(-10, 0)" title="Move Left">⬅</button>
                <button (click)="nudgeSelectedObject(0, -10)" title="Move Up">⬆</button>
                <button (click)="nudgeSelectedObject(0, 10)" title="Move Down">⬇</button>
                <button (click)="nudgeSelectedObject(10, 0)" title="Move Right">➡</button>
              </div>
              <div class="group-label">Size &amp; Position (Move)</div>
            </div>

            <div class="ribbon-group">
              <div class="group-controls">
                <label class="color-picker-btn" title="Shape / Box Fill Color">
                  🪣 Fill
                  <input type="color" [ngModel]="objBgColor()" (ngModelChange)="setSelectedObjectFill($event)" />
                </label>
                <label class="color-picker-btn" title="Shape / Box Border Color">
                  ▭ Border
                  <input type="color" [ngModel]="objBorderColor()" (ngModelChange)="setSelectedObjectBorderColor($event)" />
                </label>
                <select (change)="setSelectedObjectBorderStyle($any($event.target).value)" title="Border Style">
                  <option value="1px solid">Solid</option>
                  <option value="2px solid">Thick Solid</option>
                  <option value="2px dashed">Dashed</option>
                  <option value="3px double">Double</option>
                  <option value="none">No Border</option>
                </select>
                <button class="btn-danger-lite" (click)="deleteSelectedObject()" title="Delete Selected Text Box / Shape / Image">
                  🗑 Delete
                </button>
              </div>
              <div class="group-label">Shape Styles</div>
            </div>
          }
        </div>
        }
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
      <div class="workspace-split" [class.sidebar-collapsed]="!isRightSidebarOpen()">
        <!-- Center Canvas Area with Horizontal & Vertical Rulers -->
        <div
          class="canvas-viewport"
          (mousemove)="onCanvasMouseMove($event)"
          (mouseup)="onCanvasMouseUp()"
        >
          <div class="canvas-zoom-stage" [style.zoom]="zoomPercent() + '%'">
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

              <!-- Paginated Physical Sheet (Microsoft Word A4 Paper) -->
              <div
                class="page-sheet"
                [class.show-gridlines]="showGridlines"
                [style.width.mm]="effectivePageWidthMm()"
                [style.minHeight.mm]="effectivePageHeightMm()"
                [style.paddingTop.mm]="pageSetup.marginTopMm"
                [style.paddingBottom.mm]="pageSetup.marginBottomMm"
                [style.paddingLeft.mm]="pageSetup.marginLeftMm"
                [style.paddingRight.mm]="pageSetup.marginRightMm"
                (dragover)="onCanvasDragOver($event)"
                (drop)="onCanvasDrop($event)"
              >
                <!-- Subtle MS Word Margin Crop Marks -->
                <span class="crop-mark crop-tl" [style.top.mm]="pageSetup.marginTopMm" [style.left.mm]="pageSetup.marginLeftMm"></span>
                <span class="crop-mark crop-tr" [style.top.mm]="pageSetup.marginTopMm" [style.right.mm]="pageSetup.marginRightMm"></span>
                <span class="crop-mark crop-bl" [style.bottom.mm]="pageSetup.marginBottomMm" [style.left.mm]="pageSetup.marginLeftMm"></span>
                <span class="crop-mark crop-br" [style.bottom.mm]="pageSetup.marginBottomMm" [style.right.mm]="pageSetup.marginRightMm"></span>

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
                <div class="sheet-region header-region" [class.region-focused]="activeEditorRegion() === 'header'">
                  <div class="region-badge">Header</div>
                  <div
                    #headerEditor
                    class="editable-surface header-surface"
                    contenteditable="true"
                    (focus)="activeEditorRegion.set('header')"
                    (mousedown)="onEditorMouseDown($event)"
                    (keyup)="onEditorKeyUp()"
                    (mouseup)="onEditorMouseUp()"
                    (paste)="onEditorPaste($event)"
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
                    (mousedown)="onEditorMouseDown($event)"
                    (keyup)="onEditorKeyUp()"
                    (mouseup)="onEditorMouseUp()"
                    (paste)="onEditorPaste($event)"
                    (contextmenu)="onCanvasRightClick($event)"
                  ></div>
                </div>

                <!-- Repeating Page Footer Region -->
                <div class="sheet-region footer-region" [class.region-focused]="activeEditorRegion() === 'footer'">
                  <div class="region-badge">Footer</div>
                  <div
                    #footerEditor
                    class="editable-surface footer-surface"
                    contenteditable="true"
                    (focus)="activeEditorRegion.set('footer')"
                    (mousedown)="onEditorMouseDown($event)"
                    (keyup)="onEditorKeyUp()"
                    (mouseup)="onEditorMouseUp()"
                    (paste)="onEditorPaste($event)"
                    (contextmenu)="onCanvasRightClick($event)"
                  ></div>
                </div>
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
        @if (isRightSidebarOpen()) {
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
                  <span>Drag, Click, or click <b>📋 Copy</b> &amp; Paste (<code>Ctrl+V</code>) or type <code>{{ '{{Table.Alias}}' }}</code> anywhere!</span>
                </div>
              }
            </div>

            <div class="field-search-box">
              <input
                type="text"
                placeholder="Search published fields, aliases, or tables..."
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
                        [title]="grp.isReachable ? 'Drag onto canvas, Click to insert, or click Copy to paste anywhere: ' + fld.displayName : grp.lockReason"
                        (dragstart)="onFieldDragStart($event, fld, grp.isReachable)"
                        (click)="onFieldClickInsert(fld, grp.isReachable)"
                      >
                        <div class="fld-main">
                          <span class="fld-alias">{{ fld.displayName }}</span>
                          <code class="fld-col">{{ '{{' + fld.tableName + '.' + fld.displayName + '}}' }}</code>
                        </div>
                        <div class="fld-right">
                          <span class="fld-type">{{ fld.dataType }}</span>
                          @if (grp.isReachable) {
                            <button
                              class="btn-copy-tag-mini"
                              [title]="'Copy {{' + fld.tableName + '.' + fld.displayName + '}} to clipboard — Paste (Ctrl+V) anywhere!'"
                              (click)="copyFieldMergeTag(fld, grp.isReachable); $event.stopPropagation()"
                            >
                              📋 Copy
                            </button>
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
        }
      </div>

      <!-- Microsoft Word Bottom Status Bar (Hidden in Full Screen Mode so ONLY Ribbon + Page + Fields show) -->
      @if (!isFullScreen()) {
        <div class="word-status-bar">
          <div class="status-left">
            <span class="status-item">📄 Page 1 of 1</span>
            <span class="status-sep">|</span>
            <span class="status-item">{{ pageSetup.pageSize }} {{ pageSetup.orientation }} ({{ effectivePageWidthMm() }} × {{ effectivePageHeightMm() }} mm)</span>
            <span class="status-sep">|</span>
            <span class="status-item">⚓ Anchor: <strong>{{ anchorTable() || 'None (Zero-State)' }}</strong></span>
            <span class="status-sep">|</span>
            <span class="status-item">🏷 {{ selectedFields().length }} Bound Fields · {{ runtimeFilters().length }} Filters</span>
          </div>
          <div class="status-right">
            <button class="status-mode-btn" (click)="isRightSidebarOpen.set(!isRightSidebarOpen())">
              {{ isRightSidebarOpen() ? '◨ Hide Sidebar' : '◧ Show Sidebar' }}
            </button>
            <button class="status-mode-btn" (click)="toggleFullScreen()">
              {{ isFullScreen() ? '🗗 Exit Full Screen' : '⛶ Full Screen' }}
            </button>
            <span class="status-sep">|</span>
            <button class="status-zoom-step" (click)="zoomPercent.set(Math.max(40, zoomPercent() - 10))" title="Zoom Out">−</button>
            <input
              type="range"
              class="status-zoom-slider"
              min="40"
              max="220"
              step="5"
              [ngModel]="zoomPercent()"
              (ngModelChange)="zoomPercent.set($event)"
            />
            <button class="status-zoom-step" (click)="zoomPercent.set(Math.min(220, zoomPercent() + 10))" title="Zoom In">+</button>
            <span class="status-zoom-pct" (click)="zoomPercent.set(80)" title="Click to reset zoom to 80%">{{ zoomPercent() }}%</span>
          </div>
        </div>
      }

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
      background: #f3f2f1;
      user-select: none;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .designer-root.fullscreen-mode {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2500;
    }
    .template-bar {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      padding: 5px 12px;
      background: #185abd;
      color: #ffffff;
      gap: 8px;
    }
    .word-app-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: #ffffff;
      color: #185abd;
      font-weight: 800;
      font-size: 13px;
      letter-spacing: -0.5px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }
    .template-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      flex: 1 1 auto;
    }
    .template-picker, .doc-mode-select {
      padding: 4px 8px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      font-size: 12px;
      background: rgba(255,255,255,0.14);
      color: #ffffff;
      max-width: 235px;
      outline: none;
    }
    .template-picker option, .doc-mode-select option {
      background: #ffffff;
      color: #0f172a;
    }
    .template-name-input {
      padding: 4px 10px;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 4px;
      font-size: 12.5px;
      font-weight: 600;
      min-width: 175px;
      background: rgba(255,255,255,0.95);
      color: #0f172a;
    }
    .template-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .save-toast {
      background: #dcfce7;
      color: #166534;
      padding: 3px 9px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
    }
    .btn-window-mode {
      background: rgba(255,255,255,0.14);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.3);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-window-mode:hover {
      background: rgba(255,255,255,0.24);
    }
    .btn-fullscreen-toggle {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
      padding: 4px 11px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-fullscreen-toggle.active-fs {
      background: #fee2e2;
      color: #991b1b;
      border-color: #fca5a5;
    }
    .btn-sql-toggle {
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-save {
      background: #ffffff;
      color: #185abd;
      border: 1px solid #ffffff;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-run {
      background: #107c41;
      color: #ffffff;
      border: 1px solid #a7f3d0;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .word-ribbon {
      flex: 0 0 auto;
      background: #f3f2f1;
      padding: 0 10px 6px;
      border-bottom: 1px solid #d2d0ce;
    }
    .ribbon-tabs-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 4px 0;
    }
    .ribbon-tabs {
      display: flex;
      gap: 2px;
      align-items: center;
    }
    .ribbon-tabs button {
      border: none;
      background: transparent;
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 500;
      color: #323130;
      cursor: pointer;
      border-radius: 4px 4px 0 0;
      position: relative;
    }
    .ribbon-tabs button:hover {
      background: #edebe9;
    }
    .ribbon-tabs button.active {
      color: #185abd;
      font-weight: 700;
    }
    .ribbon-tabs button.active::after {
      content: '';
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 1px;
      height: 3px;
      border-radius: 2px;
      background: #185abd;
    }
    .ribbon-tabs button.contextual-tab {
      color: #986f0b;
      background: #fff4ce;
      font-weight: 600;
    }
    .ribbon-right-quick {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .quick-zoom-btn, .btn-collapse-ribbon {
      border: 1px solid #d2d0ce;
      background: #ffffff;
      color: #323130;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .quick-zoom-btn:hover, .btn-collapse-ribbon:hover {
      background: #edebe9;
    }
    .quick-save-btn {
      border: 1px solid #185abd;
      background: #185abd;
      color: #ffffff;
      padding: 2px 9px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .quick-run-btn {
      border: 1px solid #107c41;
      background: #107c41;
      color: #ffffff;
      padding: 2px 9px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .quick-fs-btn {
      border: 1px solid #f59e0b;
      background: #fef3c7;
      color: #92400e;
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .quick-fs-btn.active-fs {
      border-color: #ef4444;
      background: #fee2e2;
      color: #991b1b;
    }
    .quick-zoom-lbl {
      font-size: 11.5px;
      font-weight: 700;
      color: #185abd;
      min-width: 36px;
      text-align: center;
      cursor: pointer;
    }
    .ribbon-body {
      display: flex;
      flex-wrap: nowrap;
      overflow-x: auto;
      gap: 8px;
      padding: 6px 12px 4px;
      background: #fbfbfb;
      border: 1px solid #e1dfdd;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
      min-height: 58px;
      align-items: stretch;
    }
    .ribbon-group {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding-right: 10px;
      border-right: 1px solid #e1dfdd;
    }
    .ribbon-group:last-child {
      border-right: none;
    }
    .group-controls {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 3px;
    }
    .ctrl-sep {
      width: 1px;
      height: 18px;
      background: #e1dfdd;
      margin: 0 2px;
    }
    .group-controls button, .group-controls select, .file-upload-btn, .color-picker-btn {
      height: 26px;
      padding: 0 7px;
      font-size: 11.5px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: #201f1e;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .group-controls select {
      border-color: #d2d0ce;
      background: #ffffff;
    }
    .font-family-select {
      width: 115px;
    }
    .font-size-select {
      width: 52px;
    }
    .icon-btn {
      min-width: 26px;
      justify-content: center;
    }
    .group-controls button:hover, .file-upload-btn:hover, .color-picker-btn:hover {
      background: #edebe9;
      border-color: #c8c6c4;
    }
    .group-controls button.active-tool, .group-controls button.btn-accent {
      background: #eff6fc;
      border-color: #185abd;
      color: #185abd;
      font-weight: 600;
    }
    .btn-danger-lite {
      background: #fde7e9 !important;
      color: #a4262c !important;
      border-color: #f1707b !important;
    }
    .color-letter {
      font-weight: 800;
      border-bottom: 3px solid #0f172a;
      line-height: 1;
      padding-bottom: 1px;
    }
    .color-picker-btn input[type="color"] {
      width: 14px;
      height: 14px;
      border: none;
      padding: 0;
      background: transparent;
      cursor: pointer;
    }
    .inline-lbl {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      font-weight: 600;
      color: #323130;
      white-space: nowrap;
    }
    .inline-lbl input[type="number"], .inline-lbl input[type="text"] {
      height: 24px;
      padding: 0 4px;
      border: 1px solid #c8c6c4;
      border-radius: 3px;
      font-size: 11px;
    }
    .sym-btn {
      font-weight: 700;
      min-width: 24px;
      justify-content: center;
    }
    .group-label {
      font-size: 9.5px;
      text-align: center;
      color: #605e5c;
      margin-top: 3px;
      letter-spacing: 0.2px;
      white-space: nowrap;
    }
    .find-replace-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
      background: #fff4ce;
      border-bottom: 1px solid #fed9cc;
      font-size: 12px;
    }
    .find-replace-bar input {
      padding: 3px 8px;
      border: 1px solid #c8c6c4;
      border-radius: 4px;
    }
    .workspace-split {
      flex: 1 1 0%;
      min-height: 0;
      min-width: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 295px;
      overflow: hidden;
    }
    .workspace-split.sidebar-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }
    .canvas-viewport {
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow-y: scroll;
      overflow-x: auto;
      padding: 16px 24px 80px;
      display: block;
      position: relative;
      background: #edebe9;
    }
    .canvas-zoom-stage {
      width: fit-content;
      margin: 0 auto;
    }
    .horizontal-ruler {
      height: 20px;
      background: #ffffff;
      border: 1px solid #c8c6c4;
      position: relative;
      margin: 0 auto 6px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .ruler-tick {
      position: absolute;
      top: 2px;
      font-size: 8.5px;
      color: #605e5c;
      border-left: 1px solid #a19f9d;
      padding-left: 2px;
      height: 14px;
    }
    .indent-marker {
      position: absolute;
      bottom: -2px;
      color: #185abd;
      font-size: 10px;
      font-weight: 700;
    }
    .canvas-row-wrap {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 6px;
      width: fit-content;
      margin: 0 auto;
      padding-bottom: 36px;
    }
    .vertical-ruler {
      width: 20px;
      background: #ffffff;
      border: 1px solid #c8c6c4;
      position: relative;
    }
    .v-ruler-tick {
      position: absolute;
      left: 2px;
      font-size: 8.5px;
      color: #605e5c;
      border-top: 1px solid #a19f9d;
      width: 14px;
    }
    .page-sheet {
      background: #ffffff;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14), 0 0 1px rgba(0, 0, 0, 0.22);
      border: 1px solid #d2d0ce;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      user-select: text;
    }
    .crop-mark {
      position: absolute;
      width: 14px;
      height: 14px;
      pointer-events: none;
      z-index: 1;
      opacity: 0.45;
    }
    .crop-tl {
      border-top: 1px solid #a19f9d;
      border-left: 1px solid #a19f9d;
    }
    .crop-tr {
      border-top: 1px solid #a19f9d;
      border-right: 1px solid #a19f9d;
    }
    .crop-bl {
      border-bottom: 1px solid #a19f9d;
      border-left: 1px solid #a19f9d;
    }
    .crop-br {
      border-bottom: 1px solid #a19f9d;
      border-right: 1px solid #a19f9d;
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
      border-bottom: 1px dashed transparent;
      padding-bottom: 6px;
      margin-bottom: 10px;
      transition: border-color 0.15s;
    }
    .footer-region {
      border-top: 1px dashed transparent;
      padding-top: 6px;
      margin-top: 10px;
      transition: border-color 0.15s;
    }
    .page-sheet:hover .header-region,
    .page-sheet:hover .footer-region,
    .header-region.region-focused,
    .footer-region.region-focused {
      border-color: #c8c6c4;
    }
    .region-badge {
      position: absolute;
      right: 0;
      top: -13px;
      font-size: 8.5px;
      text-transform: uppercase;
      color: #a19f9d;
      letter-spacing: 0.5px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .page-sheet:hover .region-badge,
    .region-focused .region-badge {
      opacity: 1;
    }
    .editable-surface {
      outline: none;
      min-height: 28px;
      font-family: Calibri, 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #0f172a;
    }
    .body-surface {
      min-height: 215mm;
    }
    .word-status-bar {
      flex: 0 0 26px;
      height: 26px;
      background: #f3f2f1;
      border-top: 1px solid #d2d0ce;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 12px;
      font-size: 11px;
      color: #323130;
    }
    .status-left, .status-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-sep {
      color: #c8c6c4;
    }
    .status-mode-btn, .status-zoom-step {
      border: 1px solid transparent;
      background: transparent;
      color: #323130;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      cursor: pointer;
    }
    .status-mode-btn:hover, .status-zoom-step:hover {
      background: #e1dfdd;
    }
    .status-zoom-slider {
      width: 90px;
      height: 4px;
      cursor: pointer;
      accent-color: #185abd;
    }
    .status-zoom-pct {
      min-width: 34px;
      text-align: right;
      font-weight: 600;
      cursor: pointer;
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
    :host ::ng-deep .word-object {
      position: relative;
      box-sizing: border-box;
      resize: both;
      overflow: auto;
      transition: box-shadow 0.12s;
    }
    :host ::ng-deep .word-object:hover {
      outline: 1px dashed #185abd;
    }
    :host ::ng-deep .selected-word-object {
      outline: 2px solid #185abd !important;
      box-shadow: 0 0 0 3px rgba(24, 90, 189, 0.18) !important;
    }
    :host ::ng-deep .obj-drag-handle {
      display: inline-block;
      background: #185abd;
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 3px;
      cursor: move;
      user-select: none;
      margin-bottom: 4px;
    }
    :host ::ng-deep tr[data-repeater="true"] {
      background: rgba(236, 253, 245, 0.55);
      outline: 2px dashed #10b981;
    }
    :host ::ng-deep tr[data-repeat-header="true"] {
      outline: 2px solid #1e3a8a;
    }
    .btn-copy-tag-mini {
      font-size: 10px;
      padding: 2px 6px;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #93c5fd;
      border-radius: 3px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-copy-tag-mini:hover {
      background: #dbeafe;
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
export class ReportDesignerComponent implements OnInit, OnDestroy {
  private readonly managerApi = inject(ManagerApiService);
  private readonly reportApi = inject(ReportApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly Math = Math;

  @ViewChild('headerEditor', { static: true }) headerEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('bodyEditor', { static: true }) bodyEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('footerEditor', { static: true }) footerEditorRef!: ElementRef<HTMLDivElement>;

  readonly ribbonTab = signal<'home' | 'insert' | 'table' | 'layout' | 'view' | 'object'>('home');
  readonly sidebarTab = signal<'fields' | 'filters'>('fields');
  readonly activeEditorRegion = signal<'header' | 'body' | 'footer'>('body');

  readonly isFullScreen = signal<boolean>(false);
  readonly isRibbonCollapsed = signal<boolean>(false);
  readonly isRightSidebarOpen = signal<boolean>(true);

  // Copy/Paste Alias & Selected Object (Text Box / Shape / Image) State
  readonly lastCopiedField = signal<CatalogColumnDto | null>(null);
  readonly hasSelectedObject = signal<boolean>(false);
  readonly objRotationDeg = signal<number>(0);
  readonly objWidthPx = signal<number>(260);
  readonly objHeightPx = signal<number>(90);
  readonly objIsFloating = signal<boolean>(false);
  readonly objBgColor = signal<string>('#ffffff');
  readonly objBorderColor = signal<string>('#185abd');

  private selectedObjectEl: HTMLElement | null = null;
  private savedSelectionRange: Range | null = null;
  private draggingFloatingEl: HTMLElement | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private readonly nonPassiveWheelListener = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 8 : -8;
      this.zoomPercent.update((curr) => Math.max(40, Math.min(220, curr + delta)));
    }
  };

  private readonly keydownEscapeListener = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.isFullScreen()) {
      this.isFullScreen.set(false);
    }
  };

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
  readonly zoomPercent = signal<number>(80);
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

    // Non-passive wheel listener so laptop Touchpad Pinch-to-Zoom (ctrlKey+wheel) zooms ONLY the Word Page, never the browser UI
    window.addEventListener('wheel', this.nonPassiveWheelListener, { passive: false });
    window.addEventListener('keydown', this.keydownEscapeListener);

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

  ngOnDestroy(): void {
    window.removeEventListener('wheel', this.nonPassiveWheelListener);
    window.removeEventListener('keydown', this.keydownEscapeListener);
  }

  toggleFullScreen(): void {
    const next = !this.isFullScreen();
    this.isFullScreen.set(next);
    if (next) {
      this.isRightSidebarOpen.set(true);
      this.isRibbonCollapsed.set(false);
      this.flashToast('Full Screen Mode: Showing ONLY Word Ribbon, Page & Side Field Section (Press Esc or Reduce to exit)');
    }
  }

  onCanvasWheelZoom(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 8 : -8;
      this.zoomPercent.update((curr) => Math.max(40, Math.min(220, curr + delta)));
    }
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

  onEditorMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const objEl = target.closest(
      '.word-object, .word-textbox, .word-shape, .word-callout, .word-signature-line, img'
    ) as HTMLElement | null;

    if (objEl) {
      this.selectCanvasObject(objEl);

      // Start dragging if it's a floating object and user clicks the top drag handle or border
      if (objEl.getAttribute('data-floating') === 'true' || target.classList.contains('floating-drag-handle')) {
        this.draggingFloatingEl = objEl;
        const rect = objEl.getBoundingClientRect();
        this.dragOffsetX = event.clientX - rect.left;
        this.dragOffsetY = event.clientY - rect.top;
      }
    } else {
      this.clearSelectedCanvasObject();
    }
  }

  onEditorMouseUp(): void {
    this.saveCurrentSelectionRange();
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

  onEditorKeyUp(): void {
    this.saveCurrentSelectionRange();
    this.detectActiveTableFromSelection();
    this.convertRawTypedMergeTokensInDom();
    this.syncCanvasState();
  }

  onEditorPaste(event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData('text/plain') || '';
    if (pastedText && /\{\{[^{}]+\}\}/.test(pastedText)) {
      event.preventDefault();
      this.insertTextWithAutoMergeTags(pastedText);
      return;
    }
    setTimeout(() => {
      this.convertRawTypedMergeTokensInDom();
      this.syncCanvasState();
    }, 30);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (!this.draggingFloatingEl) return;
    const sheetEl = this.draggingFloatingEl.closest('.page-sheet') as HTMLElement | null;
    if (!sheetEl) return;

    const sheetRect = sheetEl.getBoundingClientRect();
    const scale = (this.zoomPercent() || 100) / 100;
    const newLeft = Math.max(4, (event.clientX - sheetRect.left - this.dragOffsetX) / scale);
    const newTop = Math.max(4, (event.clientY - sheetRect.top - this.dragOffsetY) / scale);

    this.draggingFloatingEl.style.left = `${Math.round(newLeft)}px`;
    this.draggingFloatingEl.style.top = `${Math.round(newTop)}px`;
  }

  onCanvasMouseUp(): void {
    if (this.draggingFloatingEl) {
      this.draggingFloatingEl = null;
      this.syncCanvasState();
    }
  }

  private saveCurrentSelectionRange(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const hostEl = container.nodeType === 1 ? (container as HTMLElement) : container.parentElement;
    if (
      hostEl &&
      (this.headerEditorRef.nativeElement.contains(hostEl) ||
        this.bodyEditorRef.nativeElement.contains(hostEl) ||
        this.footerEditorRef.nativeElement.contains(hostEl))
    ) {
      this.savedSelectionRange = range.cloneRange();
    }
  }

  private selectCanvasObject(el: HTMLElement): void {
    if (this.selectedObjectEl && this.selectedObjectEl !== el) {
      this.selectedObjectEl.classList.remove('selected-word-object');
    }
    this.selectedObjectEl = el;
    el.classList.add('selected-word-object');
    this.hasSelectedObject.set(true);

    const rotAttr = Number(el.getAttribute('data-rotation') || '0');
    this.objRotationDeg.set(Number.isFinite(rotAttr) ? rotAttr : 0);
    this.objWidthPx.set(Math.round(el.offsetWidth || 260));
    this.objHeightPx.set(Math.round(el.offsetHeight || 90));
    this.objIsFloating.set(el.getAttribute('data-floating') === 'true');
  }

  private clearSelectedCanvasObject(): void {
    if (this.selectedObjectEl) {
      this.selectedObjectEl.classList.remove('selected-word-object');
    }
    this.selectedObjectEl = null;
    this.hasSelectedObject.set(false);
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
      '<div class="word-object word-callout" data-rotation="0" style="border:1px solid #60a5fa;background:#eff6ff;padding:12px;border-radius:6px;margin:10px 0;resize:both;overflow:auto;"><strong>Callout / Note:</strong> Enter important summary remarks or paste {{Table.Alias}} merge tags here.</div><p></p>'
    );
  }

  insertSignatureLine(): void {
    this.insertHtmlIntoActiveEditor(
      '<div class="word-object word-signature-line" data-rotation="0" style="display:flex;justify-content:space-between;margin-top:32px;padding:6px;"><div style="border-top:1px solid #0f172a;width:200px;padding-top:4px;font-size:10pt;">Authorized Signatory</div><div style="border-top:1px solid #0f172a;width:200px;padding-top:4px;font-size:10pt;">Receiver Signature &amp; Date</div></div><p></p>'
    );
  }

  insertTextBox(mode: 'inline' | 'floating'): void {
    if (mode === 'floating') {
      const floatingHtml =
        '<div class="word-object word-textbox floating-word-object" data-floating="true" data-rotation="0" style="position:absolute;top:110px;left:120px;width:260px;min-height:90px;z-index:30;border:1.5px solid #185abd;background:#ffffff;padding:10px 12px;border-radius:4px;box-shadow:0 6px 18px rgba(15,23,42,0.14);resize:both;overflow:auto;">' +
        '<div class="floating-drag-handle" contenteditable="false" style="font-size:9px;font-weight:700;color:#185abd;background:#eff6ff;margin:-10px -12px 6px -12px;padding:3px 8px;cursor:move;border-bottom:1px solid #bfdbfe;display:flex;justify-content:space-between;"><span>✥ FLOATING TEXT BOX (Drag to Move / Click to Rotate)</span><span>🔄</span></div>' +
        '<div><strong>Text Box Heading</strong><br/>Type text, drag fields, or paste {{Table.Alias}} here...</div>' +
        '</div>';
      this.insertHtmlIntoActiveEditor(floatingHtml);
      this.ribbonTab.set('object');
      this.flashToast('Inserted Movable Floating Text Box — Drag header to position or use Shape & Object Format tab to rotate');
      return;
    }

    const inlineHtml =
      '<div class="word-object word-textbox" data-floating="false" data-rotation="0" style="display:inline-block;width:260px;min-height:80px;border:1.5px solid #185abd;background:#ffffff;padding:10px 12px;border-radius:4px;margin:8px 4px;vertical-align:top;resize:both;overflow:auto;">' +
      '<strong>Text Box</strong><br/>Type text, drag fields, or paste {{Table.Alias}} here...' +
      '</div><p></p>';
    this.insertHtmlIntoActiveEditor(inlineHtml);
    this.ribbonTab.set('object');
    this.flashToast('Inserted Resizable Word Text Box — Click inside to type or use Shape & Object Format to rotate');
  }

  insertStampBadge(): void {
    const stampHtml =
      '<div class="word-object word-shape" data-floating="false" data-rotation="-15" style="display:inline-block;border:3px double #dc2626;color:#dc2626;background:rgba(254,242,242,0.85);padding:8px 18px;border-radius:6px;font-weight:800;font-size:14pt;letter-spacing:0.12em;text-align:center;transform:rotate(-15deg);margin:12px;">' +
      'APPROVED / VERIFIED' +
      '</div><p></p>';
    this.insertHtmlIntoActiveEditor(stampHtml);
    this.ribbonTab.set('object');
    this.flashToast('Inserted Rotated Stamp Badge (-15°) — Adjust angle anytime in Shape & Object Format tab');
  }

  insertShapePreset(shape: string): void {
    if (!shape) return;
    let html = '';
    if (shape === 'rect') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="display:inline-block;width:220px;min-height:70px;border:2px solid #185abd;background:#eff6ff;border-radius:8px;padding:12px;text-align:center;margin:8px;resize:both;overflow:auto;"><strong>Rounded Rectangle</strong><br/>Click to edit or rotate</div><p></p>';
    } else if (shape === 'pill') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="display:inline-block;min-width:160px;border:2px solid #047857;background:#ecfdf5;color:#065f46;border-radius:999px;padding:8px 20px;font-weight:700;text-align:center;margin:8px;">STATUS: IN TRANSIT</div><p></p>';
    } else if (shape === 'banner') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="width:100%;border-left:6px solid #185abd;background:linear-gradient(90deg,#dbeafe,#f8fafc);padding:10px 16px;font-weight:700;color:#1e3a8a;margin:10px 0;">SECTION BANNER HEADING</div><p></p>';
    } else if (shape === 'circle') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;border:3px solid #1e3a8a;background:#eff6ff;color:#1e3a8a;border-radius:50%;font-weight:800;font-size:10pt;text-align:center;margin:8px;">OFFICIAL<br/>SEAL</div><p></p>';
    } else if (shape === 'arrow-right') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="display:inline-block;background:#185abd;color:#ffffff;padding:8px 24px;clip-path:polygon(0% 20%, 75% 20%, 75% 0%, 100% 50%, 75% 100%, 75% 80%, 0% 80%);font-weight:700;margin:8px;">NEXT STEP ➔</div><p></p>';
    } else if (shape === 'warning') {
      html =
        '<div class="word-object word-shape" data-rotation="0" style="border:2px dashed #d97706;background:#fffbeb;color:#92400e;padding:10px 14px;border-radius:6px;margin:8px 0;"><strong>⚠ IMPORTANT NOTICE:</strong> Verify consignment seal and driver particulars before dispatch.</div><p></p>';
    }
    if (html) {
      this.insertHtmlIntoActiveEditor(html);
      this.ribbonTab.set('object');
    }
  }

  // ==================== OBJECT ROTATION, RESIZING & FLOATING CONTROLS ====================

  rotateSelectedObjectBy(deltaDeg: number): void {
    const next = ((this.objRotationDeg() + deltaDeg + 180) % 360) - 180;
    this.setSelectedObjectRotation(next);
  }

  setSelectedObjectRotation(deg: number): void {
    const clamped = Math.max(-180, Math.min(180, Number(deg) || 0));
    this.objRotationDeg.set(clamped);

    const target = this.getOrFallbackSelectedObject();
    if (!target) {
      this.flashToast('Click any Text Box, Shape, Stamp, or Image on the page first to rotate it');
      return;
    }

    target.setAttribute('data-rotation', String(clamped));
    target.style.transform = clamped === 0 ? '' : `rotate(${clamped}deg)`;
    this.syncCanvasState();
  }

  setSelectedObjectSize(widthPx: number, heightPx: number): void {
    const w = Math.max(40, Math.min(900, Number(widthPx) || 240));
    const h = Math.max(24, Math.min(900, Number(heightPx) || 80));
    this.objWidthPx.set(w);
    this.objHeightPx.set(h);

    const target = this.getOrFallbackSelectedObject();
    if (!target) return;
    target.style.width = `${w}px`;
    target.style.minHeight = `${h}px`;
    this.syncCanvasState();
  }

  toggleSelectedObjectFloating(): void {
    const target = this.getOrFallbackSelectedObject();
    if (!target) {
      this.flashToast('Click a Text Box, Shape, or Image first to toggle Floating vs Inline mode');
      return;
    }

    const currentlyFloating = target.getAttribute('data-floating') === 'true';
    if (currentlyFloating) {
      target.setAttribute('data-floating', 'false');
      target.classList.remove('floating-word-object');
      target.style.position = '';
      target.style.top = '';
      target.style.left = '';
      target.style.zIndex = '';
      this.objIsFloating.set(false);
      this.flashToast('Object set to Inline with Text');
    } else {
      target.setAttribute('data-floating', 'true');
      target.classList.add('floating-word-object');
      target.style.position = 'absolute';
      target.style.top = target.style.top || '120px';
      target.style.left = target.style.left || '120px';
      target.style.zIndex = '30';
      this.objIsFloating.set(true);
      this.flashToast('Object set to Floating Over Page — Use Drag or Arrow buttons to position anywhere');
    }
    this.syncCanvasState();
  }

  nudgeSelectedObject(dx: number, dy: number): void {
    const target = this.getOrFallbackSelectedObject();
    if (!target) return;

    if (target.getAttribute('data-floating') !== 'true') {
      this.toggleSelectedObjectFloating();
    }
    const curLeft = parseFloat(target.style.left || '120') || 120;
    const curTop = parseFloat(target.style.top || '120') || 120;
    target.style.left = `${Math.max(0, curLeft + dx)}px`;
    target.style.top = `${Math.max(0, curTop + dy)}px`;
    this.syncCanvasState();
  }

  setSelectedObjectFill(color: string): void {
    this.objBgColor.set(color);
    const target = this.getOrFallbackSelectedObject();
    if (target) {
      target.style.backgroundColor = color;
      this.syncCanvasState();
    }
  }

  setSelectedObjectBorderColor(color: string): void {
    this.objBorderColor.set(color);
    const target = this.getOrFallbackSelectedObject();
    if (target) {
      target.style.borderColor = color;
      this.syncCanvasState();
    }
  }

  setSelectedObjectBorderStyle(stylePrefix: string): void {
    if (!stylePrefix) return;
    const target = this.getOrFallbackSelectedObject();
    if (!target) return;
    if (stylePrefix === 'none') {
      target.style.border = 'none';
    } else {
      target.style.border = `${stylePrefix} ${this.objBorderColor()}`;
    }
    this.syncCanvasState();
  }

  deleteSelectedObject(): void {
    const target = this.getOrFallbackSelectedObject();
    if (!target) return;
    target.remove();
    this.clearSelectedCanvasObject();
    this.syncCanvasState();
  }

  private getOrFallbackSelectedObject(): HTMLElement | null {
    if (this.selectedObjectEl && document.body.contains(this.selectedObjectEl)) {
      return this.selectedObjectEl;
    }
    const lastInserted = this.bodyEditorRef.nativeElement.querySelector(
      '.word-object:last-of-type, .word-textbox:last-of-type, .word-shape:last-of-type, img:last-of-type'
    ) as HTMLElement | null;
    if (lastInserted) {
      this.selectCanvasObject(lastInserted);
    }
    return this.selectedObjectEl;
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

  copyFieldMergeTag(field: CatalogColumnDto, isReachable: boolean): void {
    if (!isReachable) {
      this.flashToast(`Cannot copy "${field.displayName}": Table "${field.tableName}" is locked (no FK path to anchor)`);
      return;
    }
    this.lastCopiedField.set(field);
    const token = `{{${field.tableName}.${field.displayName}}}`;
    navigator.clipboard?.writeText(token).catch(() => {});
    this.flashToast(`Copied ${token} — Paste (Ctrl+V) or type it anywhere in the page, table, or text box!`);
  }

  pasteCopiedFieldTag(): void {
    const fld = this.lastCopiedField();
    if (!fld) return;
    this.tryBindFieldOntoCanvas(fld);
  }

  private insertTextWithAutoMergeTags(rawText: string): void {
    const htmlWithTags = rawText.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (fullMatch, inner: string) => {
      const tokenText = inner.trim();
      if (tokenText.toUpperCase().startsWith('SYSTEM.')) {
        return `<span>{{${tokenText}}}</span>`;
      }
      const matchedField = this.findCatalogFieldByToken(tokenText);
      if (!matchedField) {
        return fullMatch;
      }
      return this.registerAndBuildMergeTagSpan(matchedField);
    });
    this.insertHtmlIntoActiveEditor(htmlWithTags);
  }

  private convertRawTypedMergeTokensInDom(): void {
    const regions = [
      this.headerEditorRef.nativeElement,
      this.bodyEditorRef.nativeElement,
      this.footerEditorRef.nativeElement
    ];

    let convertedAny = false;
    for (const root of regions) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodesToProcess: Text[] = [];
      let current = walker.nextNode();
      while (current) {
        const parentEl = current.parentElement;
        if (
          parentEl &&
          !parentEl.closest('.merge-tag') &&
          current.nodeValue &&
          /\{\{[^{}]+\}\}/.test(current.nodeValue)
        ) {
          textNodesToProcess.push(current as Text);
        }
        current = walker.nextNode();
      }

      for (const textNode of textNodesToProcess) {
        const raw = textNode.nodeValue || '';
        let nodeChanged = false;
        const replacedHtml = raw.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, inner: string) => {
          const tokenText = inner.trim();
          if (tokenText.toUpperCase().startsWith('SYSTEM.')) {
            return full;
          }
          const matchedField = this.findCatalogFieldByToken(tokenText);
          if (!matchedField) return full;
          nodeChanged = true;
          convertedAny = true;
          return this.registerAndBuildMergeTagSpan(matchedField);
        });

        if (nodeChanged && textNode.parentNode) {
          const wrapper = document.createElement('span');
          wrapper.innerHTML = replacedHtml + '&nbsp;';
          textNode.parentNode.replaceChild(wrapper, textNode);
        }
      }
    }

    if (convertedAny) {
      this.refreshReachabilityAndSql();
      this.flashToast('Bound typed/pasted {{Table.Alias}} merge tag to SQL query!');
    }
  }

  private findCatalogFieldByToken(tokenText: string): CatalogColumnDto | null {
    const normalized = tokenText.trim().toLowerCase();
    const allFields = this.publishedFields();

    if (normalized.includes('.')) {
      const [tblPart, ...rest] = normalized.split('.');
      const fieldPart = rest.join('.').trim();
      const exactMatch = allFields.find(
        (f) =>
          f.tableName.toLowerCase() === tblPart.trim() &&
          (f.displayName.toLowerCase() === fieldPart || f.columnName.toLowerCase() === fieldPart)
      );
      if (exactMatch) return exactMatch;
    }

    return (
      allFields.find(
        (f) => f.displayName.toLowerCase() === normalized || f.columnName.toLowerCase() === normalized
      ) ?? null
    );
  }

  private registerAndBuildMergeTagSpan(field: CatalogColumnDto): string {
    const tableAlias = field.tableName;
    const colSqlAlias = `${tableAlias}_${field.columnName}`.replace(/[^a-zA-Z0-9_]/g, '_');
    const displayLabel = field.displayName;
    const isRepeater = this.activeTableRowElement?.getAttribute('data-repeater') === 'true';

    const alreadySelected = this.selectedFields().some((s) => s.columnSqlAlias === colSqlAlias);
    if (!alreadySelected) {
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
        roleConstraintName: null,
        roleLabel: null
      } as SelectedFieldDto;
      this.selectedFields.update((curr) => [...curr, newSelected]);
    }

    return `<span class="merge-tag" contenteditable="false" data-table="${field.tableName}" data-column="${field.columnName}" data-alias="${colSqlAlias}" data-table-alias="${tableAlias}" data-format="" data-transform="" data-aggregate="NONE" data-null-default="">{{${tableAlias}.${displayLabel}}}</span>`;
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

    if (this.savedSelectionRange) {
      const container = this.savedSelectionRange.commonAncestorContainer;
      const hostEl = container.nodeType === 1 ? (container as HTMLElement) : container.parentElement;
      if (hostEl && targetEl.contains(hostEl)) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(this.savedSelectionRange);
        }
      }
    }

    document.execCommand('insertHTML', false, html);
    this.saveCurrentSelectionRange();
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

