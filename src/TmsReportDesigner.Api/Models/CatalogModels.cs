namespace TmsReportDesigner.Api.Models;

public sealed record CatalogColumnDto(
    int? FieldId,
    string SchemaName,
    string TableName,
    string ColumnName,
    string DataType,
    bool IsNullable,
    bool IsPrimaryKey,
    string DisplayName,
    string Category,
    bool IsFilterable,
    bool IsActive,
    bool HasPhysicalForeignKeys
);

public sealed record CatalogTableSummaryDto(
    string SchemaName,
    string TableName,
    string Category,
    int TotalColumns,
    int PublishedColumns,
    int FilterableColumns,
    bool HasPhysicalForeignKeys,
    int CustomRelationshipCount
);

public sealed class UpsertCatalogFieldRequest
{
    public string SchemaName { get; init; } = "dbo";
    public required string TableName { get; init; }
    public required string ColumnName { get; init; }
    public required string DisplayName { get; init; }
    public string Category { get; init; } = "General";
    public bool IsFilterable { get; init; }
    public bool IsActive { get; init; }
}

public sealed class BulkTableGovernanceRequest
{
    public bool PublishAll { get; init; } = true;
    public bool AutoHumanizeAliases { get; init; } = true;
    public string? CategoryOverride { get; init; }
    public bool MarkKeyAndDateColumnsFilterable { get; init; } = true;
}

public sealed class CreateCustomRelationshipRequest
{
    public string ParentSchema { get; init; } = "dbo";
    public required string ParentTable { get; init; }
    public required string ParentColumn { get; init; }
    public string ReferencedSchema { get; init; } = "dbo";
    public required string ReferencedTable { get; init; }
    public required string ReferencedColumn { get; init; }
    public string? RoleLabel { get; init; }
}

