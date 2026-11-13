namespace TmsReportDesigner.Api.Models;

public enum FkCardinality
{
    ManyToOne,
    OneToMany
}

public sealed record ColumnMetadata(
    string SchemaName,
    string TableName,
    string ColumnName,
    string DataType,
    int? MaxLength,
    int? NumericPrecision,
    int? NumericScale,
    bool IsNullable,
    int OrdinalPosition,
    bool IsPrimaryKey
);

public sealed record TableMetadata(
    string SchemaName,
    string TableName,
    IReadOnlyList<string> PrimaryKeyColumns,
    IReadOnlyList<ColumnMetadata> Columns,
    bool HasPhysicalForeignKeys
);

public sealed record FkColumnPair(
    string ParentColumn,
    string ReferencedColumn,
    int ConstraintColumnId
);

public sealed record FkEdge(
    string EdgeId,
    string ConstraintName,
    string FromSchema,
    string FromTable,
    string ToSchema,
    string ToTable,
    FkCardinality Cardinality,
    IReadOnlyList<FkColumnPair> ColumnPairs,
    string RoleLabel,
    bool IsComposite,
    bool IsSelfReferencing,
    bool IsVirtual
);

public sealed record CustomRelationshipRecord(
    int RelationshipId,
    string ConstraintName,
    string ParentSchema,
    string ParentTable,
    string ParentColumn,
    string ReferencedSchema,
    string ReferencedTable,
    string ReferencedColumn,
    string? RoleLabel,
    bool IsActive,
    DateTime CreatedAt
);

public sealed record MultiFkTablePairInfo(
    string FromTable,
    string ToTable,
    int ForeignKeyCount,
    IReadOnlyList<FkEdge> Edges
);

public sealed class SchemaGraphSnapshot
{
    public required IReadOnlyDictionary<string, TableMetadata> Tables { get; init; }
    public required IReadOnlyDictionary<string, IReadOnlyList<FkEdge>> AdjacencyList { get; init; }
    public required IReadOnlyList<FkEdge> AllEdges { get; init; }
    public required int TotalColumns { get; init; }
    public required int PhysicalForeignKeyCount { get; init; }
    public required int CustomRelationshipCount { get; init; }
    public required int ConnectedTableCount { get; init; }
    public required int UnlinkedTableCount { get; init; }
    public required int CompositeForeignKeyCount { get; init; }
    public required int SelfReferencingForeignKeyCount { get; init; }
    public required IReadOnlyList<MultiFkTablePairInfo> MultiFkPairs { get; init; }
    public DateTime BuiltAtUtc { get; init; } = DateTime.UtcNow;
}

