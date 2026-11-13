import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CatalogColumnDto {
  fieldId?: number | null;
  schemaName: string;
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  foreignKeyTarget?: string | null;
  displayName: string;
  category: string;
  isFilterable: boolean;
  isActive: boolean;
  hasPhysicalForeignKeys: boolean;
}

export interface CatalogTableSummaryDto {
  schemaName: string;
  tableName: string;
  category: string;
  totalColumns: number;
  publishedColumns: number;
  filterableColumns: number;
  hasPhysicalForeignKeys: boolean;
  customRelationshipCount: number;
}

export interface UpsertCatalogFieldRequest {
  schemaName: string;
  tableName: string;
  columnName: string;
  displayName: string;
  category: string;
  isFilterable: boolean;
  isActive: boolean;
}

export interface CustomRelationshipRecord {
  relationshipId: number;
  constraintName: string;
  parentSchema: string;
  parentTable: string;
  parentColumn: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
  roleLabel?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCustomRelationshipRequest {
  parentSchema?: string;
  parentTable: string;
  parentColumn: string;
  referencedSchema?: string;
  referencedTable: string;
  referencedColumn: string;
  roleLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class ManagerApiService {
  private readonly http = inject(HttpClient);

  getTableSummaries(search?: string, filterMode?: string): Observable<CatalogTableSummaryDto[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (filterMode) params = params.set('filterMode', filterMode);
    return this.http.get<CatalogTableSummaryDto[]>('/api/manager/tables', { params });
  }

  getColumns(options: {
    tableName?: string;
    search?: string;
    publishedOnly?: boolean;
    category?: string;
  }): Observable<CatalogColumnDto[]> {
    let params = new HttpParams();
    if (options.tableName) params = params.set('tableName', options.tableName);
    if (options.search) params = params.set('search', options.search);
    if (options.publishedOnly !== undefined) params = params.set('publishedOnly', String(options.publishedOnly));
    if (options.category) params = params.set('category', options.category);
    return this.http.get<CatalogColumnDto[]>('/api/manager/columns', { params });
  }

  getPublishedFields(): Observable<CatalogColumnDto[]> {
    return this.http.get<CatalogColumnDto[]>('/api/manager/published-fields');
  }

  upsertFields(fields: UpsertCatalogFieldRequest[]): Observable<{ updatedCount: number }> {
    return this.http.put<{ updatedCount: number }>('/api/manager/fields', fields);
  }

  bulkGovernTable(
    tableName: string,
    payload: {
      publishAll: boolean;
      autoHumanizeAliases: boolean;
      categoryOverride?: string;
      markKeyAndDateColumnsFilterable: boolean;
    }
  ): Observable<{ tableName: string; updatedCount: number }> {
    return this.http.post<{ tableName: string; updatedCount: number }>(
      `/api/manager/tables/${encodeURIComponent(tableName)}/bulk-publish`,
      payload
    );
  }

  seedDefaultCatalog(): Observable<{ seededCount: number }> {
    return this.http.post<{ seededCount: number }>('/api/manager/seed-defaults', {});
  }

  getCustomRelationships(): Observable<CustomRelationshipRecord[]> {
    return this.http.get<CustomRelationshipRecord[]>('/api/manager/custom-relationships');
  }

  createCustomRelationship(payload: CreateCustomRelationshipRequest): Observable<CustomRelationshipRecord> {
    return this.http.post<CustomRelationshipRecord>('/api/manager/custom-relationships', payload);
  }

  deleteCustomRelationship(id: number): Observable<{ deleted: boolean; relationshipId: number }> {
    return this.http.delete<{ deleted: boolean; relationshipId: number }>(`/api/manager/custom-relationships/${id}`);
  }
}

