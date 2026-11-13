import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ExecuteReportRequest,
  QueryMetadataDto,
  ReachabilityResult,
  ReportExecutionResponseDto,
  SaveReportTemplateRequest,
  SavedReportTemplateDto,
  SqlCompileResultDto
} from '../models/report-template.models';

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  private readonly http = inject(HttpClient);

  computeReachability(
    activeTables: string[],
    selectedRoleConstraints?: Record<string, string>
  ): Observable<ReachabilityResult> {
    return this.http.post<ReachabilityResult>('/api/schema/reachability', {
      activeTables,
      selectedRoleConstraints: selectedRoleConstraints ?? {}
    });
  }

  getTemplates(): Observable<SavedReportTemplateDto[]> {
    return this.http.get<SavedReportTemplateDto[]>('/api/templates');
  }

  getTemplateById(id: number): Observable<SavedReportTemplateDto> {
    return this.http.get<SavedReportTemplateDto>(`/api/templates/${id}`);
  }

  compilePreview(metadata: QueryMetadataDto): Observable<SqlCompileResultDto> {
    return this.http.post<SqlCompileResultDto>('/api/templates/compile-preview', metadata);
  }

  saveTemplate(request: SaveReportTemplateRequest): Observable<SavedReportTemplateDto> {
    if (request.templateId && request.templateId > 0) {
      return this.http.put<SavedReportTemplateDto>(`/api/templates/${request.templateId}`, request);
    }
    return this.http.post<SavedReportTemplateDto>('/api/templates', request);
  }

  deleteTemplate(id: number): Observable<{ deleted: boolean; templateId: number }> {
    return this.http.delete<{ deleted: boolean; templateId: number }>(`/api/templates/${id}`);
  }

  getFilterLookupValues(tableName: string, columnName: string, search?: string): Observable<string[]> {
    let params = new HttpParams().set('tableName', tableName).set('columnName', columnName);
    if (search) params = params.set('search', search);
    return this.http.get<string[]>('/api/reports/filter-lookup', { params });
  }

  executeReport(templateId: number, request: ExecuteReportRequest): Observable<ReportExecutionResponseDto> {
    return this.http.post<ReportExecutionResponseDto>(`/api/reports/${templateId}/execute`, request);
  }

  exportDocx(templateId: number, request: ExecuteReportRequest): Observable<Blob> {
    return this.http.post(`/api/reports/${templateId}/export/docx`, request, {
      responseType: 'blob'
    });
  }

  exportPdf(templateId: number, request: ExecuteReportRequest): Observable<Blob> {
    return this.http.post(`/api/reports/${templateId}/export/pdf`, request, {
      responseType: 'blob'
    });
  }
}

