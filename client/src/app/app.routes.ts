import { Routes } from '@angular/router';
import { ManagerPortalComponent } from './features/manager/manager-portal.component';
import { ReportDesignerComponent } from './features/designer/report-designer.component';
import { ReportRunnerComponent } from './features/runner/report-runner.component';

export const routes: Routes = [
  { path: '', redirectTo: 'manager', pathMatch: 'full' },
  { path: 'manager', component: ManagerPortalComponent },
  { path: 'designer', component: ReportDesignerComponent },
  { path: 'designer/:id', component: ReportDesignerComponent },
  { path: 'reports', component: ReportRunnerComponent },
  { path: 'reports/run/:templateId', component: ReportRunnerComponent }
];
