using System.Text.RegularExpressions;
using Dapper;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class SchemaIntrospectionService : ISchemaIntrospectionService
{
    private readonly IDbConnectionFactory _connectionFactory;

    private sealed class RawTableRow
    {
        public string SchemaName { get; set; } = "dbo";
        public string TableName { get; set; } = string.Empty;
    }

    private sealed class RawColumnRow
    {
        public string SchemaName { get; set; } = "dbo";
        public string TableName { get; set; } = string.Empty;
        public string ColumnName { get; set; } = string.Empty;
        public string DataType { get; set; } = string.Empty;
        public int? MaxLength { get; set; }
        public int? NumericPrecision { get; set; }
        public int? NumericScale { get; set; }
        public bool IsNullable { get; set; }
        public int OrdinalPosition { get; set; }
    }

    private sealed class RawPkRow
    {
        public string SchemaName { get; set; } = "dbo";
        public string TableName { get; set; } = string.Empty;
        public string ColumnName { get; set; } = string.Empty;
        public int KeyOrdinal { get; set; }
    }

    private sealed class RawFkColumnRow
    {
        public string ConstraintName { get; set; } = string.Empty;
        public int ConstraintColumnId { get; set; }
        public string ParentSchema { get; set; } = "dbo";
        public string ParentTable { get; set; } = string.Empty;
        public string ParentColumn { get; set; } = string.Empty;
        public string ReferencedSchema { get; set; } = "dbo";
        public string ReferencedTable { get; set; } = string.Empty;
        public string ReferencedColumn { get; set; } = string.Empty;
    }

    public SchemaIntrospectionService(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<IReadOnlyList<TableMetadata>> IntrospectTablesAndColumnsAsync(CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();

        const string tablesSql = @"
            SELECT
                TABLE_SCHEMA AS SchemaName,
                TABLE_NAME AS TableName
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_SCHEMA, TABLE_NAME;
        ";

        const string columnsSql = @"
            SELECT
                TABLE_SCHEMA AS SchemaName,
                TABLE_NAME AS TableName,
                COLUMN_NAME AS ColumnName,
                DATA_TYPE AS DataType,
                CHARACTER_MAXIMUM_LENGTH AS MaxLength,
                CAST(NUMERIC_PRECISION AS INT) AS NumericPrecision,
                CAST(NUMERIC_SCALE AS INT) AS NumericScale,
                CASE WHEN IS_NULLABLE = 'YES' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsNullable,
                ORDINAL_POSITION AS OrdinalPosition
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
        ";

        const string pkSql = @"
            SELECT
                s.name AS SchemaName,
                t.name AS TableName,
                c.name AS ColumnName,
                ic.key_ordinal AS KeyOrdinal
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic
                ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns c
                ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            INNER JOIN sys.tables t
                ON i.object_id = t.object_id
            INNER JOIN sys.schemas s
                ON t.schema_id = s.schema_id
            WHERE i.is_primary_key = 1
            ORDER BY s.name, t.name, ic.key_ordinal;
        ";

        const string fkParticipantSql = @"
            SELECT DISTINCT t.name
            FROM sys.foreign_keys fk
            INNER JOIN sys.tables t
                ON fk.parent_object_id = t.object_id OR fk.referenced_object_id = t.object_id;
        ";

        var tables = (await conn.QueryAsync<RawTableRow>(new CommandDefinition(tablesSql, cancellationToken: cancellationToken))).ToList();
        var columns = (await conn.QueryAsync<RawColumnRow>(new CommandDefinition(columnsSql, cancellationToken: cancellationToken))).ToList();
        var pks = (await conn.QueryAsync<RawPkRow>(new CommandDefinition(pkSql, cancellationToken: cancellationToken))).ToList();
        var fkParticipants = (await conn.QueryAsync<string>(new CommandDefinition(fkParticipantSql, cancellationToken: cancellationToken)))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var pkByTable = pks
            .GroupBy(p => p.TableName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderBy(x => x.KeyOrdinal).Select(x => x.ColumnName).ToList(),
                StringComparer.OrdinalIgnoreCase);

        var colsByTable = columns
            .GroupBy(c => c.TableName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderBy(x => x.OrdinalPosition).ToList(),
                StringComparer.OrdinalIgnoreCase);

        var result = new List<TableMetadata>(tables.Count);
        foreach (var t in tables)
        {
            var pkList = pkByTable.TryGetValue(t.TableName, out var foundPks)
                ? foundPks
                : new List<string>();
            var pkSet = pkList.ToHashSet(StringComparer.OrdinalIgnoreCase);

            var rawCols = colsByTable.TryGetValue(t.TableName, out var foundCols)
                ? foundCols
                : new List<RawColumnRow>();

            var colModels = rawCols
                .Select(c => new ColumnMetadata(
                    c.SchemaName,
                    c.TableName,
                    c.ColumnName,
                    c.DataType,
                    c.MaxLength,
                    c.NumericPrecision,
                    c.NumericScale,
                    c.IsNullable,
                    c.OrdinalPosition,
                    pkSet.Contains(c.ColumnName)))
                .ToList();

            // Fallback PK heuristic if physical PK index is missing on a table: first column ending with _Id or Id
            if (pkList.Count == 0 && colModels.Count > 0)
            {
                var fallbackPk = colModels.FirstOrDefault(c =>
                    c.ColumnName.EndsWith("_Id", StringComparison.OrdinalIgnoreCase) ||
                    c.ColumnName.Equals("Id", StringComparison.OrdinalIgnoreCase));
                if (fallbackPk is not null)
                {
                    pkList = new List<string> { fallbackPk.ColumnName };
                }
            }

            result.Add(new TableMetadata(
                t.SchemaName,
                t.TableName,
                pkList,
                colModels,
                fkParticipants.Contains(t.TableName)));
        }

        return result;
    }

    public async Task<IReadOnlyList<FkEdge>> IntrospectPhysicalForeignKeysAsync(CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();

        const string fkSql = @"
            SELECT
                fk.name AS ConstraintName,
                fkc.constraint_column_id AS ConstraintColumnId,
                ps.name AS ParentSchema,
                pt.name AS ParentTable,
                pc.name AS ParentColumn,
                rs.name AS ReferencedSchema,
                rt.name AS ReferencedTable,
                rc.name AS ReferencedColumn
            FROM sys.foreign_keys fk
            INNER JOIN sys.foreign_key_columns fkc
                ON fk.object_id = fkc.constraint_object_id
            INNER JOIN sys.tables pt
                ON fkc.parent_object_id = pt.object_id
            INNER JOIN sys.schemas ps
                ON pt.schema_id = ps.schema_id
            INNER JOIN sys.columns pc
                ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
            INNER JOIN sys.tables rt
                ON fkc.referenced_object_id = rt.object_id
            INNER JOIN sys.schemas rs
                ON rt.schema_id = rs.schema_id
            INNER JOIN sys.columns rc
                ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
            ORDER BY fk.name, fkc.constraint_column_id;
        ";

        var rows = await conn.QueryAsync<RawFkColumnRow>(new CommandDefinition(fkSql, cancellationToken: cancellationToken));

        var grouped = rows
            .GroupBy(r => r.ConstraintName, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var first = g.First();
                var pairs = g
                    .OrderBy(x => x.ConstraintColumnId)
                    .Select(x => new FkColumnPair(x.ParentColumn, x.ReferencedColumn, x.ConstraintColumnId))
                    .ToList();

                var roleLabel = DeriveRoleLabel(first.ParentColumn, first.ReferencedTable);
                var isComposite = pairs.Count > 1;
                var isSelfRef = string.Equals(first.ParentTable, first.ReferencedTable, StringComparison.OrdinalIgnoreCase);

                return new FkEdge(
                    EdgeId: $"{first.ConstraintName}:N21",
                    ConstraintName: first.ConstraintName,
                    FromSchema: first.ParentSchema,
                    FromTable: first.ParentTable,
                    ToSchema: first.ReferencedSchema,
                    ToTable: first.ReferencedTable,
                    Cardinality: FkCardinality.ManyToOne,
                    ColumnPairs: pairs,
                    RoleLabel: roleLabel,
                    IsComposite: isComposite,
                    IsSelfReferencing: isSelfRef,
                    IsVirtual: false);
            })
            .ToList();

        return grouped;
    }

    public async Task<IReadOnlyList<CustomRelationshipRecord>> GetActiveCustomRelationshipsAsync(CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();

        const string sql = @"
            IF OBJECT_ID('dbo.Report_Custom_Relationships', 'U') IS NOT NULL
            BEGIN
                SELECT
                    RelationshipId,
                    ConstraintName,
                    ParentSchema,
                    ParentTable,
                    ParentColumn,
                    ReferencedSchema,
                    ReferencedTable,
                    ReferencedColumn,
                    RoleLabel,
                    IsActive,
                    CreatedAt
                FROM dbo.Report_Custom_Relationships
                WHERE IsActive = 1
                ORDER BY RelationshipId;
            END
        ";

        var rows = await conn.QueryAsync<CustomRelationshipRecord>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.ToList();
    }

    public static string DeriveRoleLabel(string parentColumn, string referencedTable)
    {
        if (string.IsNullOrWhiteSpace(parentColumn))
        {
            return referencedTable;
        }

        var cleaned = Regex.Replace(parentColumn, @"(_Id|_ID|_Code|Id)$", "", RegexOptions.IgnoreCase);
        cleaned = cleaned.Replace('_', ' ').Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? parentColumn : cleaned;
    }
}

