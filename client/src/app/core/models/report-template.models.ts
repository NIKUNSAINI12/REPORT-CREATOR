export interface FkColumnPairDto {
  parentColumn: string;
  referencedColumn: string;
  constraintColumnId: number;
}

export interface RoleOptionDto {
  constraintName: string;
  roleLabel: string;
  fromTable: string;
  toTable: string;
  columnPairs: FkColumnPairDto[];
  suggestedAlias: string;
}

export interface JoinStepDto {
  fromTable: string;
  fromAlias: string;
  toTable: string;
  toAlias: string;
  constraintName: string;
  roleLabel: string;
  cardinality: number | string;
  columnPairs: FkColumnPairDto[];
  joinPredicateSql: string;
}

export interface TableReachabilityInfo {
  tableName: string;
  isReachable: boolean;
  hopDistance: number;
  lockReason?: string | null;
  requiresRoleDisambiguation: boolean;
  availableRoles: RoleOptionDto[];
}

export interface ReachabilityResult {
  isZeroState: boolean;
  anchorTable?: string | null;
  reachableTables: string[];
  lockedTables: string[];
  tableDetails: Record<string, TableReachabilityInfo>;
  resolvedJoinPath: JoinStepDto[];
}

export interface SelectedFieldDto {
  fieldId?: number | null;
  schemaName: string;
  tableName: string;
  columnName: string;
  tableAlias: string;
  columnSqlAlias: string;
  displayName: string;
  dataType: string;
  formatString?: string | null;
  textTransform?: string | null;
  nullDefaultValue?: string | null;
  aggregateFunction: string;
  isRepeaterField: boolean;
  repeaterTableName?: string | null;
  roleConstraintName?: string | null;
  roleLabel?: string | null;
}

export interface RuntimeFilterConfigDto {
  filterId: string;
  fieldId?: number | null;
  schemaName: string;
  tableName: string;
  columnName: string;
  tableAlias: string;
  filterLabel: string;
  dataType: string;
  operator: string;
  uiControlType: string;
  isRequired: boolean;
  defaultValue?: string | null;
}

export interface QueryMetadataDto {
  anchorTable?: string | null;
  documentMode: 'SingleOrBatchDocument' | 'SummaryList';
  selectedFields: SelectedFieldDto[];
  joinPath: JoinStepDto[];
  filterConfig: RuntimeFilterConfigDto[];
  selectedRoleConstraints: Record<string, string>;
}

export interface PageSetupDto {
  pageSize: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'Custom';
  orientation: 'Portrait' | 'Landscape';
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  columns: number;
}

export interface WatermarkDto {
  enabled: boolean;
  type: 'Text' | 'Image';
  text: string;
  imageUrl?: string | null;
  rotationDeg: number;
  opacity: number;
  color: string;
  fontSizePt: number;
}

export interface LayoutDocumentDto {
  pageSetup: PageSetupDto;
  watermark: WatermarkDto;
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  showGridlines: boolean;
}

export interface SaveReportTemplateRequest {
  templateId?: number | null;
  templateName: string;
  description?: string | null;
  anchorTableName?: string | null;
  documentMode: 'SingleOrBatchDocument' | 'SummaryList';
  layout: LayoutDocumentDto;
  queryMetadata: QueryMetadataDto;
}

export interface SavedReportTemplateDto {
  templateId: number;
  templateName: string;
  description?: string | null;
  anchorTableName?: string | null;
  documentMode: 'SingleOrBatchDocument' | 'SummaryList';
  layoutJson: string;
  queryMetadataJson: string;
  compiledSelectQuery: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SqlCompileResultDto {
  compiledSelectQuery: string;
  anchorTable?: string | null;
  resolvedJoinPath: JoinStepDto[];
  normalizedFields: SelectedFieldDto[];
}

export interface RuntimeFilterValueInput {
  filterId: string;
  columnName?: string;
  value?: string;
  secondValue?: string;
  multiValues?: string[];
}

export interface ExecuteReportRequest {
  filters: RuntimeFilterValueInput[];
  queryParamOverrides?: Record<string, string>;
  overrideDocumentMode?: string;
  maxRows?: number;
  printedBy?: string;
}

export interface RenderedDocumentUnitDto {
  documentIndex: number;
  primaryKeyValue: string;
  renderedHeaderHtml: string;
  renderedBodyHtml: string;
  renderedFooterHtml: string;
  scalarValues: Record<string, string>;
  repeaterRowCounts: Record<string, number>;
  computedAggregates: Record<string, string>;
}

export interface ReportExecutionResponseDto {
  templateId: number;
  templateName: string;
  anchorTableName?: string | null;
  documentMode: string;
  executedSql: string;
  boundParameterNames: string[];
  totalMasterRecords: number;
  totalRawRows: number;
  documents: RenderedDocumentUnitDto[];
  combinedPreviewHtml: string;
  pageSetup: PageSetupDto;
  watermark: WatermarkDto;
  executedAtUtc: string;
}

