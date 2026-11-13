namespace TmsReportDesigner.Api.Models;

public sealed class SelectedFieldDto
{
    public int? FieldId { get; set; }
    public string SchemaName { get; set; } = "dbo";
    public string TableName { get; set; } = string.Empty;
    public string ColumnName { get; set; } = string.Empty;
    public string TableAlias { get; set; } = string.Empty;
    public string ColumnSqlAlias { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string DataType { get; set; } = "varchar";
    public string? FormatString { get; set; }
    public string? TextTransform { get; set; }
    public string? NullDefaultValue { get; set; }
    public string AggregateFunction { get; set; } = "NONE";
    public bool IsRepeaterField { get; set; }
    public string? RepeaterTableName { get; set; }
    public string? RoleConstraintName { get; set; }
    public string? RoleLabel { get; set; }
}

public sealed class RuntimeFilterConfigDto
{
    public string FilterId { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public int? FieldId { get; set; }
    public string SchemaName { get; set; } = "dbo";
    public string TableName { get; set; } = string.Empty;
    public string ColumnName { get; set; } = string.Empty;
    public string TableAlias { get; set; } = string.Empty;
    public string FilterLabel { get; set; } = string.Empty;
    public string DataType { get; set; } = "varchar";
    public string Operator { get; set; } = "=";
    public string UiControlType { get; set; } = "Text";
    public bool IsRequired { get; set; }
    public string? DefaultValue { get; set; }
}

public sealed class QueryMetadataDto
{
    public string? AnchorTable { get; set; }
    public string DocumentMode { get; set; } = "SingleOrBatchDocument";
    public List<SelectedFieldDto> SelectedFields { get; set; } = new();
    public List<JoinStepDto> JoinPath { get; set; } = new();
    public List<RuntimeFilterConfigDto> FilterConfig { get; set; } = new();
    public Dictionary<string, string> SelectedRoleConstraints { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PageSetupDto
{
    public string PageSize { get; set; } = "A4";
    public string Orientation { get; set; } = "Portrait";
    public double WidthMm { get; set; } = 210;
    public double HeightMm { get; set; } = 297;
    public double MarginTopMm { get; set; } = 20;
    public double MarginBottomMm { get; set; } = 20;
    public double MarginLeftMm { get; set; } = 20;
    public double MarginRightMm { get; set; } = 20;
    public int Columns { get; set; } = 1;
}

public sealed class WatermarkDto
{
    public bool Enabled { get; set; }
    public string Type { get; set; } = "Text";
    public string Text { get; set; } = "CONFIDENTIAL";
    public string? ImageUrl { get; set; }
    public int RotationDeg { get; set; } = -45;
    public double Opacity { get; set; } = 0.12;
    public string Color { get; set; } = "#64748b";
    public int FontSizePt { get; set; } = 64;
}

public sealed class LayoutDocumentDto
{
    public PageSetupDto PageSetup { get; set; } = new();
    public WatermarkDto Watermark { get; set; } = new();
    public string HeaderHtml { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public string FooterHtml { get; set; } = string.Empty;
    public bool ShowGridlines { get; set; } = true;
}

public sealed class SaveReportTemplateRequest
{
    public int? TemplateId { get; set; }
    public required string TemplateName { get; set; }
    public string? Description { get; set; }
    public string? AnchorTableName { get; set; }
    public string DocumentMode { get; set; } = "SingleOrBatchDocument";
    public required LayoutDocumentDto Layout { get; set; }
    public required QueryMetadataDto QueryMetadata { get; set; }
}

public sealed class SavedReportTemplateDto
{
    public int TemplateId { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? AnchorTableName { get; set; }
    public string DocumentMode { get; set; } = "SingleOrBatchDocument";
    public string LayoutJson { get; set; } = string.Empty;
    public string QueryMetadataJson { get; set; } = string.Empty;
    public string CompiledSelectQuery { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class SqlCompileResultDto
{
    public required string CompiledSelectQuery { get; init; }
    public required string? AnchorTable { get; init; }
    public required IReadOnlyList<JoinStepDto> ResolvedJoinPath { get; init; }
    public required IReadOnlyList<SelectedFieldDto> NormalizedFields { get; init; }
}

public sealed class RuntimeFilterValueInput
{
    public string FilterId { get; set; } = string.Empty;
    public string? ColumnName { get; set; }
    public string? Value { get; set; }
    public string? SecondValue { get; set; }
    public List<string>? MultiValues { get; set; }
}

public sealed class ExecuteReportRequest
{
    public List<RuntimeFilterValueInput> Filters { get; set; } = new();
    public Dictionary<string, string> QueryParamOverrides { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public string? OverrideDocumentMode { get; set; }
    public int MaxRows { get; set; } = 500;
    public string PrintedBy { get; set; } = "TMS Portal User";
}

public sealed class RenderedDocumentUnitDto
{
    public int DocumentIndex { get; set; }
    public string PrimaryKeyValue { get; set; } = string.Empty;
    public string RenderedHeaderHtml { get; set; } = string.Empty;
    public string RenderedBodyHtml { get; set; } = string.Empty;
    public string RenderedFooterHtml { get; set; } = string.Empty;
    public Dictionary<string, string> ScalarValues { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> RepeaterRowCounts { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> ComputedAggregates { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ReportExecutionResponseDto
{
    public int TemplateId { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public string? AnchorTableName { get; set; }
    public string DocumentMode { get; set; } = "SingleOrBatchDocument";
    public string ExecutedSql { get; set; } = string.Empty;
    public List<string> BoundParameterNames { get; set; } = new();
    public int TotalMasterRecords { get; set; }
    public int TotalRawRows { get; set; }
    public List<RenderedDocumentUnitDto> Documents { get; set; } = new();
    public string CombinedPreviewHtml { get; set; } = string.Empty;
    public PageSetupDto PageSetup { get; set; } = new();
    public WatermarkDto Watermark { get; set; } = new();
    public DateTime ExecutedAtUtc { get; set; } = DateTime.UtcNow;
}

