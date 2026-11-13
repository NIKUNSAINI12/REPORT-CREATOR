import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  CatalogColumnDto,
  CatalogTableSummaryDto,
  CustomRelationshipRecord,
  ManagerApiService
} from '../../core/services/manager-api.service';

@Component({
  selector: 'app-manager-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule],
  template: `
    <div class="manager-shell">
      <!-- Left Sidebar: Searchable Table Explorer -->
      <aside class="table-sidebar">
        <div class="sidebar-header">
          <h3>Database Tables ({{ filteredTables().length }})</h3>
          <button class="btn-seed" (click)="seedCoreCatalog()" [disabled]="busy()">
            ⚡ Seed Core TMS Fields
          </button>
        </div>

        <div class="search-box">
          <input
            type="text"
            placeholder="Filter 404+ tables by name or category..."
            [ngModel]="tableSearch()"
            (ngModelChange)="tableSearch.set($event)"
          />
        </div>

        <div class="filter-tabs">
          <button [class.active]="tableFilterMode() === 'all'" (click)="setTableFilter('all')">
            All ({{ allTables().length }})
          </button>
          <button [class.active]="tableFilterMode() === 'published'" (click)="setTableFilter('published')">
            Published
          </button>
          <button [class.active]="tableFilterMode() === 'linked'" (click)="setTableFilter('linked')">
            FK Linked
          </button>
          <button [class.active]="tableFilterMode() === 'unlinked'" (click)="setTableFilter('unlinked')">
            Unlinked (151)
          </button>
        </div>

        <div class="table-list">
          <button
            class="table-item all-columns-item"
            [class.selected]="selectedTableName() === null"
            (click)="selectTable(null)"
          >
            <div class="table-item-main">
              <span class="table-name">🌐 All Tables (Global Virtual Scroll)</span>
              <span class="table-cat">All 5,950+ Columns</span>
            </div>
          </button>

          @for (t of filteredTables(); track t.tableName) {
            <button
              class="table-item"
              [class.selected]="selectedTableName() === t.tableName"
              (click)="selectTable(t.tableName)"
            >
              <div class="table-item-main">
                <span class="table-name">{{ t.tableName }}</span>
                <span class="table-cat">
                  {{ t.category }}
                  @if (!t.hasPhysicalForeignKeys && t.customRelationshipCount === 0) {
                    <span class="badge-unlinked">Unlinked</span>
                  } @else if (t.customRelationshipCount > 0) {
                    <span class="badge-virtual">Virtual FK ({{ t.customRelationshipCount }})</span>
                  }
                </span>
              </div>
              <span class="col-counter" [class.has-pub]="t.publishedColumns > 0">
                {{ t.publishedColumns }}/{{ t.totalColumns }}
              </span>
            </button>
          }
        </div>
      </aside>

      <!-- Main Workspace -->
      <section class="main-panel">
        <!-- Mode Switcher & Action Bar -->
        <div class="toolbar">
          <div class="mode-tabs">
            <button
              [class.active]="activeTab() === 'dictionary'"
              (click)="activeTab.set('dictionary')"
            >
              📋 Field Governance &amp; Aliases ({{ filteredColumns().length }} Columns)
            </button>
            <button
              [class.active]="activeTab() === 'relationships'"
              (click)="activeTab.set('relationships')"
            >
              🔗 Virtual FK Relationship Builder ({{ customRelationships().length }})
            </button>
          </div>

          @if (statusMessage()) {
            <div class="toast-banner">{{ statusMessage() }}</div>
          }
        </div>

        @if (activeTab() === 'dictionary') {
          <!-- Dictionary Filter & Bulk Governance Bar -->
          <div class="sub-toolbar">
            <input
              type="text"
              class="col-search-input"
              placeholder="Search across columns, presentable aliases, data types, or categories..."
              [ngModel]="columnSearch()"
              (ngModelChange)="columnSearch.set($event)"
            />

            <label class="checkbox-inline">
              <input
                type="checkbox"
                [ngModel]="showPublishedOnly()"
                (ngModelChange)="showPublishedOnly.set($event)"
              />
              Published Only
            </label>

            @if (selectedTableName(); as tbl) {
              <div class="bulk-actions">
                <button class="btn-primary" (click)="bulkGovernSelectedTable(true, true)" [disabled]="busy()">
                  ✓ Publish &amp; Humanize All in {{ tbl }}
                </button>
                <button class="btn-secondary" (click)="autoHumanizeLoadedColumns()" [disabled]="busy()">
                  ✨ Auto-Humanize Aliases
                </button>
                <button class="btn-outline" (click)="bulkGovernSelectedTable(false, false)" [disabled]="busy()">
                  Unpublish Table
                </button>
              </div>
            } @else {
              <div class="bulk-actions">
                <button class="btn-secondary" (click)="autoHumanizeLoadedColumns()" [disabled]="busy()">
                  ✨ Auto-Humanize Visible Aliases
                </button>
              </div>
            }
          </div>

          <!-- Virtual Scrolled Column Header -->
          <div class="grid-header">
            <div class="col-pub">Active</div>
            <div class="col-raw">Database Column &amp; Table</div>
            <div class="col-type">SQL Type</div>
            <div class="col-alias">Presentable Alias (End-User Display Name)</div>
            <div class="col-cat">Category / Group</div>
            <div class="col-filt">Filter</div>
            <div class="col-act">Copy / Save</div>
          </div>

          <!-- Angular CDK Virtual Scroll Viewport for 6,000 Columns at 60 FPS -->
          <cdk-virtual-scroll-viewport itemSize="52" class="virtual-grid-viewport">
            <div
              *cdkVirtualFor="let col of filteredColumns(); trackBy: trackByColumn"
              class="grid-row"
              [class.row-published]="col.isActive"
            >
              <div class="col-pub">
                <input
                  type="checkbox"
                  [(ngModel)]="col.isActive"
                  (change)="saveSingleColumn(col)"
                  title="Toggle Published / Active for End-Users"
                />
              </div>
              <div class="col-raw" [title]="col.tableName + '.' + col.columnName + (col.isForeignKey && col.foreignKeyTarget ? ' (FK → ' + col.foreignKeyTarget + ')' : '')">
                <div class="raw-col-line">
                  <code>{{ col.columnName }}</code>
                  @if (col.isPrimaryKey) {
                    <span class="pk-badge" title="Primary Key">PK</span>
                  }
                  @if (col.isForeignKey) {
                    <span class="fk-badge" [title]="'Foreign Key → ' + (col.foreignKeyTarget || 'Referenced Table')">FK</span>
                  }
                </div>
                <span class="raw-tbl-sub">
                  {{ col.tableName }}
                  @if (col.isForeignKey && col.foreignKeyTarget) {
                    <span class="fk-target-hint">→ {{ col.foreignKeyTarget }}</span>
                  }
                </span>
              </div>
              <div class="col-type">
                <span class="type-pill">{{ col.dataType }}</span>
              </div>
              <div class="col-alias">
                <input
                  type="text"
                  [(ngModel)]="col.displayName"
                  (blur)="saveSingleColumn(col)"
                  placeholder="Enter user-friendly alias..."
                />
              </div>
              <div class="col-cat">
                <input
                  type="text"
                  [(ngModel)]="col.category"
                  (blur)="saveSingleColumn(col)"
                  placeholder="Category..."
                />
              </div>
              <div class="col-filt">
                <input
                  type="checkbox"
                  [(ngModel)]="col.isFilterable"
                  (change)="saveSingleColumn(col)"
                  title="Allow as Runtime Report Filter"
                />
              </div>
              <div class="col-act">
                <button
                  class="btn-row-copy"
                  (click)="copyColumnAliasToken(col)"
                  title="Copy {{ '{{' + col.tableName + '.' + col.displayName + '}}' }} to paste in Word Report Designer"
                >
                  📋
                </button>
                <button class="btn-row-save" (click)="saveSingleColumn(col)">Save</button>
              </div>
            </div>
          </cdk-virtual-scroll-viewport>
        } @else {
          <!-- Virtual FK Relationship Builder Tab -->
          <div class="relationships-container">
            <div class="rel-card">
              <h3>Create Virtual Foreign Key Bridge (Report_Custom_Relationships)</h3>
              <p class="rel-help">
                Link any of the 151 unlinked tables (or add custom role-playing relationships) into the Foreign Key Multigraph.
                Saving immediately reloads the in-memory BFS graph with zero downtime.
              </p>

              <div class="rel-form">
                <div class="form-group">
                  <label>Parent (Child/Source) Table</label>
                  <select [(ngModel)]="newRelParentTable" (ngModelChange)="onRelParentTableChange($event)">
                    <option value="">-- Select Parent Table --</option>
                    @for (t of allTables(); track t.tableName) {
                      <option [value]="t.tableName">
                        {{ t.tableName }} {{ !t.hasPhysicalForeignKeys ? '(Unlinked)' : '' }}
                      </option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Parent Foreign Key Column</label>
                  <select [(ngModel)]="newRelParentColumn">
                    <option value="">-- Select Column --</option>
                    @for (c of parentTableColumns(); track c.columnName) {
                      <option [value]="c.columnName">
                        {{ c.columnName }} ({{ c.dataType }}){{ c.isPrimaryKey ? ' [PK]' : '' }}{{ c.isForeignKey ? ' [FK → ' + c.foreignKeyTarget + ']' : '' }}
                      </option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Referenced (Target/Master) Table</label>
                  <select [(ngModel)]="newRelReferencedTable" (ngModelChange)="onRelReferencedTableChange($event)">
                    <option value="">-- Select Referenced Table --</option>
                    @for (t of allTables(); track t.tableName) {
                      <option [value]="t.tableName">{{ t.tableName }}</option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Referenced Primary/Lookup Column</label>
                  <select [(ngModel)]="newRelReferencedColumn">
                    <option value="">-- Select Column --</option>
                    @for (c of referencedTableColumns(); track c.columnName) {
                      <option [value]="c.columnName">
                        {{ c.columnName }} ({{ c.dataType }}){{ c.isPrimaryKey ? ' [PK]' : '' }}{{ c.isForeignKey ? ' [FK → ' + c.foreignKeyTarget + ']' : '' }}
                      </option>
                    }
                  </select>
                </div>

                <div class="form-group">
                  <label>Role Label (e.g., Origin Location, Billing Customer)</label>
                  <input
                    type="text"
                    [(ngModel)]="newRelRoleLabel"
                    placeholder="Optional friendly role label..."
                  />
                </div>

                <div class="form-group form-actions">
                  <button class="btn-primary" (click)="createVirtualRelationship()" [disabled]="busy()">
                    + Add Virtual FK &amp; Reload Graph
                  </button>
                </div>
              </div>
            </div>

            <div class="rel-list-card">
              <h3>Active Virtual Relationships ({{ customRelationships().length }})</h3>
              <table class="rel-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Constraint Name</th>
                    <th>Parent Table.Column</th>
                    <th>Referenced Table.Column</th>
                    <th>Role Label</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @for (rel of customRelationships(); track rel.relationshipId) {
                    <tr>
                      <td>#{{ rel.relationshipId }}</td>
                      <td><code>{{ rel.constraintName }}</code></td>
                      <td><strong>{{ rel.parentTable }}</strong>.{{ rel.parentColumn }}</td>
                      <td><strong>{{ rel.referencedTable }}</strong>.{{ rel.referencedColumn }}</td>
                      <td>{{ rel.roleLabel }}</td>
                      <td>
                        <button class="btn-danger-sm" (click)="deleteVirtualRelationship(rel.relationshipId)">
                          Delete
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;">
                        No custom virtual relationships defined yet. Use the form above to link unlinked tables.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
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
    .manager-shell {
      display: grid;
      grid-template-columns: 265px minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      background: #f8fafc;
    }
    .table-sidebar {
      background: #ffffff;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .sidebar-header {
      padding: 12px 14px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sidebar-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .btn-seed {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .search-box {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .search-box input {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      font-size: 12.5px;
    }
    .filter-tabs {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      padding: 6px 12px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .filter-tabs button {
      font-size: 11px;
      padding: 5px 4px;
      border: 1px solid #cbd5e1;
      background: #fff;
      border-radius: 4px;
      cursor: pointer;
      color: #475569;
    }
    .filter-tabs button.active {
      background: #1d4ed8;
      color: #fff;
      border-color: #1d4ed8;
      font-weight: 600;
    }
    .table-list {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: scroll;
      padding: 6px;
    }
    .table-item {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      border: none;
      background: transparent;
      border-radius: 5px;
      cursor: pointer;
      text-align: left;
      margin-bottom: 2px;
    }
    .table-item:hover {
      background: #f1f5f9;
    }
    .table-item.selected {
      background: #eff6ff;
      border-left: 3px solid #2563eb;
    }
    .table-item-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }
    .table-name {
      font-size: 12.5px;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .table-cat {
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-unlinked {
      background: #fef3c7;
      color: #92400e;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-virtual {
      background: #dcfce7;
      color: #166534;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
    }
    .col-counter {
      font-size: 11px;
      background: #e2e8f0;
      color: #475569;
      padding: 2px 6px;
      border-radius: 999px;
      font-weight: 600;
    }
    .col-counter.has-pub {
      background: #dcfce7;
      color: #15803d;
    }
    .main-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 18px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
    }
    .mode-tabs {
      display: flex;
      gap: 8px;
    }
    .mode-tabs button {
      padding: 7px 14px;
      border-radius: 5px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
    }
    .mode-tabs button.active {
      background: #1e3a8a;
      color: #ffffff;
      border-color: #1e3a8a;
    }
    .toast-banner {
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      color: #065f46;
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 12.5px;
      font-weight: 500;
    }
    .sub-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .col-search-input {
      flex: 1 1 200px;
      min-width: 160px;
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      font-size: 12.5px;
    }
    .checkbox-inline {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      white-space: nowrap;
    }
    .bulk-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .btn-primary {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-secondary {
      background: #0f172a;
      color: #fff;
      border: none;
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-outline {
      background: #fff;
      color: #475569;
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .grid-header {
      display: grid;
      grid-template-columns: 50px minmax(165px, 1.3fr) 78px minmax(210px, 2fr) minmax(120px, 1fr) 50px 96px;
      gap: 8px;
      align-items: center;
      padding: 8px 16px;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
    }
    .virtual-grid-viewport {
      flex: 1 1 0%;
      min-height: 0;
      height: 100%;
      width: 100%;
      background: #ffffff;
      overflow-y: scroll !important;
      overflow-x: auto !important;
    }
    .grid-row {
      display: grid;
      grid-template-columns: 50px minmax(165px, 1.3fr) 78px minmax(210px, 2fr) minmax(120px, 1fr) 50px 96px;
      gap: 8px;
      align-items: center;
      height: 52px;
      padding: 0 16px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12.5px;
    }
    .col-pub, .col-filt, .col-act {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 4px;
    }
    .raw-col-line {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      color: #0f172a;
    }
    .raw-tbl-sub {
      display: block;
      font-size: 10.5px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .grid-row.row-published {
      background: #f0fdf4;
    }
    .col-table, .col-raw {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 8px;
    }
    .pk-badge {
      background: #fef08a;
      color: #854d0e;
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      margin-left: 4px;
      font-weight: 700;
    }
    .fk-badge {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      margin-left: 4px;
      font-weight: 700;
    }
    .fk-target-hint {
      color: #1d4ed8;
      font-weight: 600;
      margin-left: 4px;
    }
    .type-pill {
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
    }
    .col-alias input, .col-cat input {
      width: 94%;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12.5px;
    }
    .btn-row-copy {
      background: #f8fafc;
      color: #334155;
      border: 1px solid #cbd5e1;
      padding: 4px 7px;
      border-radius: 4px;
      font-size: 11.5px;
      cursor: pointer;
    }
    .btn-row-copy:hover {
      background: #dbeafe;
      color: #185abd;
      border-color: #93c5fd;
    }
    .btn-row-save {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11.5px;
      cursor: pointer;
    }
    .relationships-container {
      flex: 1 1 0%;
      min-height: 0;
      padding: 20px;
      overflow-y: scroll;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .rel-card, .rel-list-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 18px;
    }
    .rel-card h3, .rel-list-card h3 {
      margin-top: 0;
      font-size: 15px;
    }
    .rel-help {
      font-size: 13px;
      color: #475569;
      margin-bottom: 16px;
    }
    .rel-form {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      align-items: end;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .form-group label {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
    }
    .form-group select, .form-group input {
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      font-size: 13px;
    }
    .rel-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .rel-table th, .rel-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
    }
    .btn-danger-sm {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fca5a5;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
  `]
})
export class ManagerPortalComponent implements OnInit {
  private readonly api = inject(ManagerApiService);

  readonly activeTab = signal<'dictionary' | 'relationships'>('dictionary');
  readonly busy = signal<boolean>(false);
  readonly statusMessage = signal<string>('');

  readonly allTables = signal<CatalogTableSummaryDto[]>([]);
  readonly tableSearch = signal<string>('');
  readonly tableFilterMode = signal<'all' | 'published' | 'linked' | 'unlinked'>('all');
  readonly selectedTableName = signal<string | null>('CL_Tripsheet_Header');

  readonly loadedColumns = signal<CatalogColumnDto[]>([]);
  readonly columnSearch = signal<string>('');
  readonly showPublishedOnly = signal<boolean>(false);

  readonly customRelationships = signal<CustomRelationshipRecord[]>([]);
  readonly parentTableColumns = signal<CatalogColumnDto[]>([]);
  readonly referencedTableColumns = signal<CatalogColumnDto[]>([]);

  newRelParentTable = '';
  newRelParentColumn = '';
  newRelReferencedTable = '';
  newRelReferencedColumn = '';
  newRelRoleLabel = '';

  readonly filteredTables = computed(() => {
    const term = this.tableSearch().trim().toLowerCase();
    const mode = this.tableFilterMode();
    return this.allTables().filter((t) => {
      if (mode === 'published' && t.publishedColumns === 0) return false;
      if (mode === 'linked' && !t.hasPhysicalForeignKeys && t.customRelationshipCount === 0) return false;
      if (mode === 'unlinked' && (t.hasPhysicalForeignKeys || t.customRelationshipCount > 0)) return false;
      if (!term) return true;
      return (
        t.tableName.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term)
      );
    });
  });

  readonly filteredColumns = computed(() => {
    const term = this.columnSearch().trim().toLowerCase();
    const pubOnly = this.showPublishedOnly();
    return this.loadedColumns().filter((c) => {
      if (pubOnly && !c.isActive) return false;
      if (!term) return true;
      return (
        c.tableName.toLowerCase().includes(term) ||
        c.columnName.toLowerCase().includes(term) ||
        c.displayName.toLowerCase().includes(term) ||
        c.category.toLowerCase().includes(term) ||
        c.dataType.toLowerCase().includes(term)
      );
    });
  });

  ngOnInit(): void {
    this.refreshTables();
    this.loadColumnsForSelection('CL_Tripsheet_Header');
    this.loadCustomRelationships();
  }

  trackByColumn(_index: number, item: CatalogColumnDto): string {
    return `${item.schemaName}.${item.tableName}.${item.columnName}`;
  }

  setTableFilter(mode: 'all' | 'published' | 'linked' | 'unlinked'): void {
    this.tableFilterMode.set(mode);
  }

  selectTable(tableName: string | null): void {
    this.selectedTableName.set(tableName);
    this.loadColumnsForSelection(tableName);
  }

  refreshTables(): void {
    this.api.getTableSummaries().subscribe({
      next: (tables) => this.allTables.set(tables)
    });
  }

  loadColumnsForSelection(tableName: string | null): void {
    this.busy.set(true);
    this.api.getColumns({ tableName: tableName ?? undefined }).subscribe({
      next: (cols) => {
        this.loadedColumns.set(cols);
        this.busy.set(false);
      },
      error: () => this.busy.set(false)
    });
  }

  copyColumnAliasToken(col: CatalogColumnDto): void {
    const token = `{{${col.tableName}.${col.displayName}}}`;
    navigator.clipboard?.writeText(token).catch(() => {});
    this.showToast(`Copied ${token} — Paste (Ctrl+V) anywhere in Word Report Designer!`);
  }

  saveSingleColumn(col: CatalogColumnDto): void {
    this.api
      .upsertFields([
        {
          schemaName: col.schemaName,
          tableName: col.tableName,
          columnName: col.columnName,
          displayName: col.displayName,
          category: col.category,
          isFilterable: col.isFilterable,
          isActive: col.isActive
        }
      ])
      .subscribe({
        next: () => {
          this.showToast(`Saved ${col.tableName}.${col.columnName} -> "${col.displayName}"`);
          this.refreshTables();
        }
      });
  }

  bulkGovernSelectedTable(publishAll: boolean, autoHumanizeAliases: boolean): void {
    const tbl = this.selectedTableName();
    if (!tbl) return;
    this.busy.set(true);
    this.api
      .bulkGovernTable(tbl, {
        publishAll,
        autoHumanizeAliases,
        markKeyAndDateColumnsFilterable: true
      })
      .subscribe({
        next: (res) => {
          this.showToast(`Updated ${res.updatedCount} columns in ${res.tableName}`);
          this.loadColumnsForSelection(tbl);
          this.refreshTables();
        },
        error: () => this.busy.set(false)
      });
  }

  autoHumanizeLoadedColumns(): void {
    const updated = this.filteredColumns().map((c) => {
      const humanized = this.humanizeClientSide(c.columnName);
      c.displayName = humanized;
      return {
        schemaName: c.schemaName,
        tableName: c.tableName,
        columnName: c.columnName,
        displayName: humanized,
        category: c.category,
        isFilterable: c.isFilterable,
        isActive: c.isActive
      };
    });

    if (updated.length === 0) return;
    this.busy.set(true);
    this.api.upsertFields(updated).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.showToast(`Auto-humanized ${res.updatedCount} column aliases.`);
      },
      error: () => this.busy.set(false)
    });
  }

  seedCoreCatalog(): void {
    this.busy.set(true);
    this.api.seedDefaultCatalog().subscribe({
      next: (res) => {
        this.busy.set(false);
        this.showToast(`Seeded ${res.seededCount} core TMS operational fields!`);
        this.refreshTables();
        this.loadColumnsForSelection(this.selectedTableName());
      },
      error: () => this.busy.set(false)
    });
  }

  loadCustomRelationships(): void {
    this.api.getCustomRelationships().subscribe({
      next: (rels) => this.customRelationships.set(rels)
    });
  }

  onRelParentTableChange(tableName: string): void {
    if (!tableName) {
      this.parentTableColumns.set([]);
      return;
    }
    this.api.getColumns({ tableName }).subscribe({
      next: (cols) => this.parentTableColumns.set(cols)
    });
  }

  onRelReferencedTableChange(tableName: string): void {
    if (!tableName) {
      this.referencedTableColumns.set([]);
      return;
    }
    this.api.getColumns({ tableName }).subscribe({
      next: (cols) => this.referencedTableColumns.set(cols)
    });
  }

  createVirtualRelationship(): void {
    if (
      !this.newRelParentTable ||
      !this.newRelParentColumn ||
      !this.newRelReferencedTable ||
      !this.newRelReferencedColumn
    ) {
      return;
    }
    this.busy.set(true);
    this.api
      .createCustomRelationship({
        parentTable: this.newRelParentTable,
        parentColumn: this.newRelParentColumn,
        referencedTable: this.newRelReferencedTable,
        referencedColumn: this.newRelReferencedColumn,
        roleLabel: this.newRelRoleLabel || undefined
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.showToast(`Created virtual FK ${created.constraintName} & reloaded graph!`);
          this.newRelRoleLabel = '';
          this.loadCustomRelationships();
          this.refreshTables();
        },
        error: () => this.busy.set(false)
      });
  }

  deleteVirtualRelationship(id: number): void {
    this.api.deleteCustomRelationship(id).subscribe({
      next: () => {
        this.showToast(`Deleted virtual FK #${id} & reloaded graph.`);
        this.loadCustomRelationships();
        this.refreshTables();
      }
    });
  }

  private humanizeClientSide(colName: string): string {
    return colName
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/\s+/)
      .map((w) => {
        const upper = w.toUpperCase();
        if (['ID', 'LR', 'THC', 'GST', 'PAN', 'PIN', 'POD', 'ETA', 'ETD'].includes(upper)) {
          return upper;
        }
        if (upper === 'NO') return 'Number';
        if (upper === 'DT') return 'Date';
        if (upper === 'AMT') return 'Amount';
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private showToast(msg: string): void {
    this.statusMessage.set(msg);
    setTimeout(() => {
      if (this.statusMessage() === msg) {
        this.statusMessage.set('');
      }
    }, 4000);
  }
}

