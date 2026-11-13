import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';

export interface SchemaStatusSummary {
  totalTables: number;
  totalColumns: number;
  physicalForeignKeys: number;
  customRelationships: number;
  connectedTables: number;
  unlinkedTables: number;
  compositeForeignKeys: number;
  multiFkPairs: number;
  selfReferencingForeignKeys: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <header class="top-nav">
        <div class="brand">
          <span class="brand-badge">TMS</span>
          <span class="brand-title">Report Designer &amp; SQL Engine</span>
        </div>
        <nav class="nav-links">
          <a routerLink="/manager" routerLinkActive="active">1. Manager Data Dictionary</a>
          <a routerLink="/designer" routerLinkActive="active">2. Word Report Designer</a>
          <a routerLink="/reports" routerLinkActive="active">3. Report Runner &amp; Export</a>
        </nav>
        <div class="status-pill" [class.connected]="healthStatus() === 'Healthy'">
          <span class="dot"></span>
          <span>DB: {{ databaseName() }} ({{ healthStatus() }})</span>
          @if (schemaStatus(); as stats) {
            <span class="schema-metrics">
              | {{ stats.totalTables }} Tables | {{ stats.totalColumns }} Cols | {{ stats.physicalForeignKeys }} FKs
            </span>
          }
        </div>
      </header>
      <main class="main-viewport">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }
    .top-nav {
      flex: 0 0 auto;
      min-height: 48px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: #1e3a8a;
      color: #ffffff;
      padding: 6px 14px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
    }
    .brand-badge {
      background: #2563eb;
      border: 1px solid #60a5fa;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      letter-spacing: 0.5px;
    }
    .nav-links {
      display: flex;
      gap: 6px;
    }
    .nav-links a {
      color: #dbeafe;
      text-decoration: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 13.5px;
      font-weight: 500;
      transition: background 0.15s;
    }
    .nav-links a:hover, .nav-links a.active {
      background: rgba(255,255,255,0.16);
      color: #ffffff;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      background: rgba(0,0,0,0.25);
      padding: 4px 10px;
      border-radius: 999px;
    }
    .status-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f59e0b;
    }
    .status-pill.connected .dot {
      background: #10b981;
    }
    .schema-metrics {
      color: #bfdbfe;
      font-weight: 500;
    }
    .main-viewport {
      flex: 1 1 0%;
      min-height: 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  `]
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly healthStatus = signal<string>('Connecting...');
  readonly databaseName = signal<string>('TMS_Lite_1_Oct_2026');
  readonly schemaStatus = signal<SchemaStatusSummary | null>(null);

  ngOnInit(): void {
    this.http.get<{ status: string; database: string }>('/api/health').subscribe({
      next: (res) => {
        this.healthStatus.set(res.status);
        this.databaseName.set(res.database);
      },
      error: () => {
        this.healthStatus.set('Offline');
      }
    });

    this.http.get<SchemaStatusSummary>('/api/schema/status').subscribe({
      next: (stats) => this.schemaStatus.set(stats),
      error: () => {}
    });
  }
}

