import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReportApiService } from '../../core/services/report-api.service';
import {
  QueryMetadataDto,
  ReportExecutionResponseDto,
  RuntimeFilterConfigDto,
  RuntimeFilterValueInput,
  SavedReportTemplateDto
} from '../../core/models/report-template.models';

@Component({
  selector: 'app-report-runner',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="runner-shell">
      <!-- Left Control & Runtime Filter Input Panel (NoPrint during Browser Print) -->
      <aside class="runner-sidebar no-print">
        <div class="sidebar-top">
          <h3>📊 Report Execution &amp; Export</h3>
          <select
            class="tpl-select"
            [ngModel]="selectedTemplateId()"
            (ngModelChange)="onSelectTemplate($event)"
          >
            @for (tpl of templates(); track tpl.templateId) {
              <option [ngValue]="tpl.templateId">
                #{{ tpl.templateId }} — {{ tpl.templateName }}
              </option>
            }
          </select>

          @if (selectedTemplate(); as tpl) {
            <div class="tpl-meta-box">
              <div><strong>Anchor Table:</strong> <code>{{ tpl.anchorTableName || 'N/A' }}</code></div>
              <div>
                <a [routerLink]="['/designer', tpl.templateId]" class="edit-tpl-link">
                  ✎ Edit Template in Word Designer →
                </a>
              </div>
            </div>
          }
        </div>

        <!-- Document Execution Mode Switcher -->
        <div class="mode-box">
          <label>Output Document Mode</label>
          <select [(ngModel)]="overrideDocumentMode">
            <option value="">Template Default ({{ selectedTemplate()?.documentMode || 'SingleOrBatchDocument' }})</option>
            <option value="SingleOrBatchDocument">Single / Batch Document (1 Merged Doc per Record)</option>
            <option value="SummaryList">Summary Register List (Continuous Table)</option>
          </select>
        </div>

        <!-- Dynamic Runtime Filters Configured in Designer -->
        <div class="filters-scroll">
          <h4>Runtime Filter Parameters ({{ filterConfigs().length }})</h4>

          @for (flt of filterConfigs(); track flt.filterId) {
            <div class="filter-input-card">
              <label>
                {{ flt.filterLabel }}
                @if (flt.isRequired) {
                  <span class="req-star">*</span>
                }
                <span class="op-badge">{{ flt.operator }}</span>
              </label>

              @if (flt.uiControlType === 'Dropdown') {
                <select [(ngModel)]="filterValues[flt.filterId]">
                  <option value="">-- All / Any {{ flt.filterLabel }} --</option>
                  @for (opt of lookupOptionsMap()[flt.filterId] || []; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              } @else if (flt.uiControlType === 'MultiSelect') {
                <input
                  type="text"
                  [(ngModel)]="filterValues[flt.filterId]"
                  placeholder="Comma-separated values (IN)..."
                />
              } @else if (flt.uiControlType === 'DateRangePicker' || flt.operator === 'BETWEEN') {
                <div class="range-inputs">
                  <input type="date" [(ngModel)]="filterValues[flt.filterId]" />
                  <span>to</span>
                  <input type="date" [(ngModel)]="filterSecondValues[flt.filterId]" />
                </div>
              } @else if (flt.uiControlType === 'DatePicker') {
                <input type="date" [(ngModel)]="filterValues[flt.filterId]" />
              } @else if (flt.uiControlType === 'NumberInput') {
                <input type="number" [(ngModel)]="filterValues[flt.filterId]" placeholder="Numeric value..." />
              } @else if (flt.uiControlType === 'Checkbox') {
                <select [(ngModel)]="filterValues[flt.filterId]">
                  <option value="">Any</option>
                  <option value="true">True (1)</option>
                  <option value="false">False (0)</option>
                </select>
              } @else {
                <input
                  type="text"
                  [(ngModel)]="filterValues[flt.filterId]"
                  [placeholder]="'Filter by ' + flt.columnName + '...'"
                />
              }
            </div>
          } @empty {
            <div class="no-filters-note">
              No mandatory runtime filters configured. Click <strong>Execute &amp; Merge Report</strong> below to run immediately.
            </div>
          }

          <div class="direct-url-box">
            <label>Direct Document / URL Parameter Filter (Optional)</label>
            <input
              type="text"
              [(ngModel)]="directDocIdParam"
              placeholder="e.g. Primary Key ID (?DocId=123)"
            />
          </div>
        </div>

        <div class="runner-actions">
          @if (errorMessage()) {
            <div class="err-banner">{{ errorMessage() }}</div>
          }

          <button class="btn-execute" (click)="executeReport()" [disabled]="executing()">
            {{ executing() ? '⏳ Executing Parameterized SQL...' : '▶ Execute & Merge Report' }}
          </button>

          <div class="export-buttons">
            <button class="btn-print" (click)="triggerBrowserPrint()" [disabled]="!executionResult()">
              🖨 Print / Preview
            </button>
            <button class="btn-pdf" (click)="downloadPdf()" [disabled]="!executionResult() || exporting()">
              📕 Export PDF
            </button>
            <button class="btn-docx" (click)="downloadDocx()" [disabled]="!executionResult() || exporting()">
              📘 Export Word (.docx)
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Preview & Document Navigation Area -->
      <section class="preview-workspace">
        <!-- Top Preview Status & Page Navigation Bar (NoPrint) -->
        @if (executionResult(); as res) {
          <div class="preview-toolbar no-print">
            <div class="exec-summary">
              <strong>{{ res.templateName }}</strong>
              <span class="pill-count">{{ res.totalMasterRecords }} Merged Document(s)</span>
              <span class="pill-rows">{{ res.totalRawRows }} SQL Row(s)</span>
              @if (res.boundParameterNames.length > 0) {
                <span class="pill-params">Bound: {{ res.boundParameterNames.join(', ') }}</span>
              }
            </div>

            <div class="page-nav">
              <label class="inline-chk">
                <input type="checkbox" [(ngModel)]="showAllDocumentsStacked" />
                Show All {{ res.documents.length }} Document(s) Stacked
              </label>

              @if (!showAllDocumentsStacked && res.documents.length > 1) {
                <button (click)="prevDocument()" [disabled]="activeDocIndex() <= 0">◀ Prev</button>
                <span>Document {{ activeDocIndex() + 1 }} of {{ res.documents.length }} (PK: {{ res.documents[activeDocIndex()].primaryKeyValue }})</span>
                <button (click)="nextDocument()" [disabled]="activeDocIndex() >= res.documents.length - 1">Next ▶</button>
              }

              <button class="btn-sql-inspect" (click)="showExecutedSql.set(!showExecutedSql())">
                {{ showExecutedSql() ? 'Hide SQL' : '🔍 View Executed SQL' }}
              </button>
            </div>
          </div>

          @if (showExecutedSql()) {
            <div class="executed-sql-panel no-print">
              <pre>{{ res.executedSql }}</pre>
            </div>
          }

          <!-- Rendered Paginated Document Sheets -->
          <div class="sheets-scroll-container">
            @for (doc of visibleDocuments(); track doc.documentIndex) {
              <article
                class="rendered-page-sheet"
                [style.width.mm]="effectiveWidthMm(res)"
                [style.minHeight.mm]="effectiveHeightMm(res)"
                [style.paddingTop.mm]="res.pageSetup.marginTopMm"
                [style.paddingBottom.mm]="res.pageSetup.marginBottomMm"
                [style.paddingLeft.mm]="res.pageSetup.marginLeftMm"
                [style.paddingRight.mm]="res.pageSetup.marginRightMm"
              >
                @if (res.watermark.enabled) {
                  <div class="sheet-watermark" [style.opacity]="res.watermark.opacity">
                    @if (res.watermark.type === 'Image' && res.watermark.imageUrl) {
                      <img
                        [src]="res.watermark.imageUrl"
                        [style.transform]="'rotate(' + res.watermark.rotationDeg + 'deg)'"
                        alt="Watermark"
                      />
                    } @else {
                      <span
                        [style.color]="res.watermark.color"
                        [style.fontSize.pt]="res.watermark.fontSizePt"
                        [style.transform]="'rotate(' + res.watermark.rotationDeg + 'deg)'"
                      >
                        {{ res.watermark.text }}
                      </span>
                    }
                  </div>
                }

                <header class="sheet-hdr" [innerHTML]="doc.renderedHeaderHtml"></header>
                <main
                  class="sheet-bdy"
                  [style.columnCount]="res.pageSetup.columns"
                  [style.columnGap.mm]="8"
                  [innerHTML]="doc.renderedBodyHtml"
                ></main>
                <footer class="sheet-ftr" [innerHTML]="doc.renderedFooterHtml"></footer>
              </article>
            }
          </div>
        } @else {
          <div class="empty-runner-state no-print">
            <h3>Select a Report Template and Click "Execute &amp; Merge Report"</h3>
            <p>
              Parameterized queries execute safely against <code>TMS_Lite_1_Oct_2026</code> and merge scalar fields,
              repeating data rows, and footer aggregates into print-ready A4/Letter pages.
            </p>
          </div>
        }
      </section>
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
    .runner-shell {
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: #cbd5e1;
    }
    .runner-sidebar {
      background: #ffffff;
      border-right: 1px solid #94a3b8;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .sidebar-top {
      padding: 14px;
      border-bottom: 1px solid #e2e8f0;
    }
    .sidebar-top h3 {
      margin: 0 0 10px;
      font-size: 15px;
      color: #0f172a;
    }
    .tpl-select {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #94a3b8;
      border-radius: 5px;
      font-size: 13px;
      font-weight: 600;
    }
    .tpl-meta-box {
      margin-top: 8px;
      font-size: 12px;
      color: #475569;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .edit-tpl-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }
    .mode-box {
      padding: 10px 14px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .mode-box select {
      padding: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
    }
    .filters-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: scroll;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .filters-scroll h4 {
      margin: 0;
      font-size: 13px;
      color: #334155;
    }
    .filter-input-card, .direct-url-box {
      display: flex;
      flex-direction: column;
      gap: 5px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 10px;
      border-radius: 6px;
      font-size: 12px;
    }
    .filter-input-card label, .direct-url-box label {
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .req-star {
      color: #dc2626;
      font-weight: 800;
    }
    .op-badge {
      background: #dbeafe;
      color: #1e40af;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      margin-left: auto;
    }
    .filter-input-card input, .filter-input-card select, .direct-url-box input {
      padding: 7px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12.5px;
    }
    .range-inputs {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 6px;
    }
    .runner-actions {
      padding: 14px;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .err-banner {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fca5a5;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
    }
    .btn-execute {
      background: #059669;
      color: #ffffff;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
    }
    .export-buttons {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .export-buttons button {
      padding: 8px 6px;
      border-radius: 5px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid #cbd5e1;
    }
    .btn-print {
      background: #ffffff;
      color: #0f172a;
    }
    .btn-pdf {
      background: #fee2e2;
      color: #991b1b;
      border-color: #fca5a5 !important;
    }
    .btn-docx {
      background: #dbeafe;
      color: #1e3a8a;
      border-color: #93c5fd !important;
    }
    .preview-workspace {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .preview-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 18px;
      background: #ffffff;
      border-bottom: 1px solid #94a3b8;
      font-size: 12.5px;
    }
    .exec-summary {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pill-count {
      background: #dcfce7;
      color: #166534;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
    }
    .pill-rows, .pill-params {
      background: #f1f5f9;
      color: #475569;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11.5px;
    }
    .page-nav {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .page-nav button {
      padding: 4px 10px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .executed-sql-panel {
      background: #0f172a;
      color: #a7f3d0;
      padding: 10px 18px;
      font-family: Consolas, monospace;
      font-size: 12px;
      max-height: 140px;
      overflow-y: auto;
    }
    .executed-sql-panel pre {
      margin: 0;
      white-space: pre-wrap;
    }
    .sheets-scroll-container {
      flex: 1 1 0%;
      min-height: 0;
      min-width: 0;
      height: 100%;
      overflow-y: scroll;
      overflow-x: auto;
      padding: 24px 24px 100px;
      display: block;
    }
    .rendered-page-sheet {
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      overflow: hidden;
      margin: 0 auto 28px;
    }
    .sheet-watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 1;
    }
    .sheet-watermark span {
      font-weight: 800;
      letter-spacing: 4px;
    }
    .sheet-hdr, .sheet-bdy, .sheet-ftr {
      position: relative;
      z-index: 2;
    }
    .sheet-bdy {
      flex: 1;
      margin: 10px 0;
    }
    .empty-runner-state {
      margin: auto;
      background: #ffffff;
      padding: 32px;
      border-radius: 8px;
      text-align: center;
      max-width: 520px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    @media print {
      .no-print {
        display: none !important;
      }
      .runner-shell {
        display: block;
        height: auto;
        background: #ffffff;
      }
      .sheets-scroll-container {
        padding: 0;
        overflow: visible;
      }
      .rendered-page-sheet {
        box-shadow: none;
        margin: 0;
        page-break-after: always;
        break-after: page;
      }
    }
  `]
})
export class ReportRunnerComponent implements OnInit {
  private readonly reportApi = inject(ReportApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly templates = signal<SavedReportTemplateDto[]>([]);
  readonly selectedTemplateId = signal<number | null>(null);
  readonly filterConfigs = signal<RuntimeFilterConfigDto[]>([]);
  readonly lookupOptionsMap = signal<Record<string, string[]>>({});

  filterValues: Record<string, string> = {};
  filterSecondValues: Record<string, string> = {};
  directDocIdParam = '';
  overrideDocumentMode = '';

  readonly executing = signal<boolean>(false);
  readonly exporting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly executionResult = signal<ReportExecutionResponseDto | null>(null);
  readonly activeDocIndex = signal<number>(0);
  readonly showExecutedSql = signal<boolean>(false);
  showAllDocumentsStacked = true;

  readonly selectedTemplate = computed(() =>
    this.templates().find((t) => t.templateId === this.selectedTemplateId()) ?? null
  );

  readonly visibleDocuments = computed(() => {
    const res = this.executionResult();
    if (!res) return [];
    if (this.showAllDocumentsStacked) return res.documents;
    const idx = Math.max(0, Math.min(res.documents.length - 1, this.activeDocIndex()));
    return res.documents[idx] ? [res.documents[idx]] : [];
  });

  ngOnInit(): void {
    // Capture direct URL query parameters (e.g. /reports/run/1?DocId=10&autoRun=true)
    const queryMap = this.route.snapshot.queryParamMap;
    const docIdFromUrl = queryMap.get('DocId') || queryMap.get('id') || '';
    if (docIdFromUrl) {
      this.directDocIdParam = docIdFromUrl;
    }

    this.reportApi.getTemplates().subscribe({
      next: (list) => {
        this.templates.set(list);
        const routeTplId = Number(this.route.snapshot.paramMap.get('templateId'));
        const initialId = routeTplId > 0 ? routeTplId : list[0]?.templateId ?? null;
        if (initialId) {
          this.onSelectTemplate(initialId, true);
        }
      }
    });
  }

  onSelectTemplate(templateId: number, autoExecuteOnLoad = false): void {
    this.selectedTemplateId.set(templateId);
    const tpl = this.templates().find((t) => t.templateId === templateId);
    if (!tpl) return;

    this.filterValues = {};
    this.filterSecondValues = {};
    this.errorMessage.set('');

    try {
      const meta: QueryMetadataDto = JSON.parse(tpl.queryMetadataJson);
      const filters = meta.filterConfig ?? [];
      this.filterConfigs.set(filters);

      for (const flt of filters) {
        if (flt.defaultValue) {
          this.filterValues[flt.filterId] = flt.defaultValue;
        }
        // Check URL query param override by columnName
        const urlVal = this.route.snapshot.queryParamMap.get(flt.columnName);
        if (urlVal) {
          this.filterValues[flt.filterId] = urlVal;
        }
        if (flt.uiControlType === 'Dropdown' && flt.tableName && flt.columnName) {
          this.reportApi.getFilterLookupValues(flt.tableName, flt.columnName).subscribe({
            next: (values) => {
              this.lookupOptionsMap.update((curr) => ({ ...curr, [flt.filterId]: values }));
            }
          });
        }
      }
    } catch {
      this.filterConfigs.set([]);
    }

    if (autoExecuteOnLoad) {
      this.executeReport();
    }
  }

  executeReport(): void {
    const tplId = this.selectedTemplateId();
    if (!tplId) return;

    this.errorMessage.set('');
    this.executing.set(true);

    const payload = this.buildExecuteRequest();
    this.reportApi.executeReport(tplId, payload).subscribe({
      next: (res) => {
        this.executing.set(false);
        this.executionResult.set(res);
        this.activeDocIndex.set(0);
      },
      error: (err) => {
        this.executing.set(false);
        this.errorMessage.set(err?.error?.error || 'Failed to execute report query.');
      }
    });
  }

  triggerBrowserPrint(): void {
    window.print();
  }

  downloadPdf(): void {
    const tplId = this.selectedTemplateId();
    if (!tplId) return;
    this.exporting.set(true);
    this.reportApi.exportPdf(tplId, this.buildExecuteRequest()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.triggerBlobDownload(blob, `TMS_Report_${tplId}.pdf`);
      },
      error: () => this.exporting.set(false)
    });
  }

  downloadDocx(): void {
    const tplId = this.selectedTemplateId();
    if (!tplId) return;
    this.exporting.set(true);
    this.reportApi.exportDocx(tplId, this.buildExecuteRequest()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.triggerBlobDownload(blob, `TMS_Report_${tplId}.docx`);
      },
      error: () => this.exporting.set(false)
    });
  }

  prevDocument(): void {
    this.activeDocIndex.update((i) => Math.max(0, i - 1));
  }

  nextDocument(): void {
    const total = this.executionResult()?.documents.length ?? 1;
    this.activeDocIndex.update((i) => Math.min(total - 1, i + 1));
  }

  effectiveWidthMm(res: ReportExecutionResponseDto): number {
    return res.pageSetup.orientation === 'Landscape'
      ? Math.max(res.pageSetup.widthMm, res.pageSetup.heightMm)
      : Math.min(res.pageSetup.widthMm, res.pageSetup.heightMm);
  }

  effectiveHeightMm(res: ReportExecutionResponseDto): number {
    return res.pageSetup.orientation === 'Landscape'
      ? Math.min(res.pageSetup.widthMm, res.pageSetup.heightMm)
      : Math.max(res.pageSetup.widthMm, res.pageSetup.heightMm);
  }

  private buildExecuteRequest() {
    const filters: RuntimeFilterValueInput[] = this.filterConfigs().map((flt) => ({
      filterId: flt.filterId,
      columnName: flt.columnName,
      value: this.filterValues[flt.filterId] ?? '',
      secondValue: this.filterSecondValues[flt.filterId] ?? ''
    }));

    const queryParamOverrides: Record<string, string> = {};
    if (this.directDocIdParam.trim()) {
      queryParamOverrides['DocId'] = this.directDocIdParam.trim();
    }

    return {
      filters,
      queryParamOverrides,
      overrideDocumentMode: this.overrideDocumentMode || undefined,
      maxRows: 500,
      printedBy: 'TMS Enterprise User'
    };
  }

  private triggerBlobDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

