using System.Text.RegularExpressions;
using Dapper;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class CatalogService : ICatalogService
{
    private static readonly HashSet<string> PreservedAcronyms = new(StringComparer.OrdinalIgnoreCase)
    {
        "ID", "LR", "THC", "GST", "PAN", "PIN", "POD", "ETA", "ETD", "KM", "KMS",
        "TDS", "TCS", "IGST", "CGST", "SGST", "HSN", "SAC", "UOM", "OTP", "SIM", "GPS", "FIFO", "URL"
    };

    private static readonly string[] CoreTmsSeedTables =
    {
        "CL_Tripsheet_Header",
        "CL_Thc_Header",
        "CL_Thc_Manifest_Detail",
        "CL_Master_Location",
        "CL_Master_Driver",
        "CL_Master_Vehicle",
        "CL_Master_Customer",
        "CL_Master_Vendor"
    };

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly IFkGraphService _fkGraphService;

    private sealed class PersistedCatalogRow
    {
        public int FieldId { get; set; }
        public string SchemaName { get; set; } = "dbo";
        public string TableName { get; set; } = string.Empty;
        public string ColumnName { get; set; } = string.Empty;
        public string DataType { get; set; } = string.Empty;
        public bool IsNullable { get; set; }
        public string DisplayName { get; set; } = string.Empty;
        public string Category { get; set; } = "General";
        public bool IsFilterable { get; set; }
        public bool IsActive { get; set; }
    }

    public CatalogService(IDbConnectionFactory connectionFactory, IFkGraphService fkGraphService)
    {
        _connectionFactory = connectionFactory;
        _fkGraphService = fkGraphService;
    }

    public async Task<IReadOnlyList<CatalogTableSummaryDto>> GetTableSummariesAsync(
        string? search = null,
        string? filterMode = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        var persistedByKey = await LoadPersistedCatalogMapAsync(cancellationToken);
        var customRels = await GetCustomRelationshipsAsync(cancellationToken);

        var customCountByTable = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var rel in customRels)
        {
            customCountByTable[rel.ParentTable] = customCountByTable.GetValueOrDefault(rel.ParentTable) + 1;
            if (!string.Equals(rel.ParentTable, rel.ReferencedTable, StringComparison.OrdinalIgnoreCase))
            {
                customCountByTable[rel.ReferencedTable] = customCountByTable.GetValueOrDefault(rel.ReferencedTable) + 1;
            }
        }

        var summaries = new List<CatalogTableSummaryDto>(snapshot.Tables.Count);
        foreach (var table in snapshot.Tables.Values.OrderBy(t => t.TableName, StringComparer.OrdinalIgnoreCase))
        {
            var publishedCount = 0;
            var filterableCount = 0;
            string? customCategory = null;

            foreach (var col in table.Columns)
            {
                var key = BuildCatalogKey(table.SchemaName, table.TableName, col.ColumnName);
                if (persistedByKey.TryGetValue(key, out var persisted))
                {
                    if (persisted.IsActive) publishedCount++;
                    if (persisted.IsFilterable) filterableCount++;
                    if (customCategory is null && !string.IsNullOrWhiteSpace(persisted.Category))
                    {
                        customCategory = persisted.Category;
                    }
                }
            }

            var category = customCategory ?? DeriveTableCategory(table.TableName);
            var customRelCount = customCountByTable.GetValueOrDefault(table.TableName);

            summaries.Add(new CatalogTableSummaryDto(
                SchemaName: table.SchemaName,
                TableName: table.TableName,
                Category: category,
                TotalColumns: table.Columns.Count,
                PublishedColumns: publishedCount,
                FilterableColumns: filterableCount,
                HasPhysicalForeignKeys: table.HasPhysicalForeignKeys,
                CustomRelationshipCount: customRelCount));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            summaries = summaries
                .Where(s =>
                    s.TableName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                    s.Category.Contains(term, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(filterMode))
        {
            summaries = filterMode.Trim().ToLowerInvariant() switch
            {
                "published" => summaries.Where(s => s.PublishedColumns > 0).ToList(),
                "linked" => summaries.Where(s => s.HasPhysicalForeignKeys || s.CustomRelationshipCount > 0).ToList(),
                "unlinked" => summaries.Where(s => !s.HasPhysicalForeignKeys && s.CustomRelationshipCount == 0).ToList(),
                _ => summaries
            };
        }

        return summaries;
    }

    public async Task<IReadOnlyList<CatalogColumnDto>> GetColumnsAsync(
        string? tableName = null,
        string? search = null,
        bool? publishedOnly = null,
        string? category = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        var persistedByKey = await LoadPersistedCatalogMapAsync(cancellationToken);

        IEnumerable<TableMetadata> targetTables = snapshot.Tables.Values;
        if (!string.IsNullOrWhiteSpace(tableName))
        {
            targetTables = snapshot.Tables.TryGetValue(tableName.Trim(), out var singleTable)
                ? new[] { singleTable }
                : Array.Empty<TableMetadata>();
        }
        else
        {
            targetTables = targetTables.OrderBy(t => t.TableName, StringComparer.OrdinalIgnoreCase);
        }

        var list = new List<CatalogColumnDto>();
        foreach (var table in targetTables)
        {
            var defaultCategory = DeriveTableCategory(table.TableName);
            foreach (var col in table.Columns)
            {
                var key = BuildCatalogKey(table.SchemaName, table.TableName, col.ColumnName);
                var hasPersisted = persistedByKey.TryGetValue(key, out var persisted);

                var dto = new CatalogColumnDto(
                    FieldId: hasPersisted ? persisted!.FieldId : null,
                    SchemaName: col.SchemaName,
                    TableName: col.TableName,
                    ColumnName: col.ColumnName,
                    DataType: col.DataType,
                    IsNullable: col.IsNullable,
                    IsPrimaryKey: col.IsPrimaryKey,
                    DisplayName: hasPersisted && !string.IsNullOrWhiteSpace(persisted!.DisplayName)
                        ? persisted.DisplayName
                        : HumanizeColumnName(col.ColumnName),
                    Category: hasPersisted && !string.IsNullOrWhiteSpace(persisted!.Category)
                        ? persisted.Category
                        : defaultCategory,
                    IsFilterable: hasPersisted && persisted!.IsFilterable,
                    IsActive: hasPersisted && persisted!.IsActive,
                    HasPhysicalForeignKeys: table.HasPhysicalForeignKeys);

                list.Add(dto);
            }
        }

        if (publishedOnly == true)
        {
            list = list.Where(c => c.IsActive).ToList();
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            var cat = category.Trim();
            list = list.Where(c => c.Category.Equals(cat, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            list = list.Where(c =>
                c.TableName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.ColumnName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.DisplayName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                c.Category.Contains(term, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        return list;
    }

    public async Task<IReadOnlyList<CatalogColumnDto>> GetPublishedFieldsAsync(CancellationToken cancellationToken = default)
    {
        var published = await GetColumnsAsync(publishedOnly: true, cancellationToken: cancellationToken);
        if (published.Count == 0)
        {
            await SeedDefaultTmsCatalogAsync(cancellationToken);
            published = await GetColumnsAsync(publishedOnly: true, cancellationToken: cancellationToken);
        }

        return published;
    }

    public async Task<int> UpsertFieldsAsync(
        IEnumerable<UpsertCatalogFieldRequest> requests,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        using var conn = _connectionFactory.CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        const string upsertSql = @"
            MERGE dbo.Report_Field_Catalog AS target
            USING (SELECT @SchemaName AS SchemaName, @TableName AS TableName, @ColumnName AS ColumnName) AS source
            ON (target.SchemaName = source.SchemaName AND target.TableName = source.TableName AND target.ColumnName = source.ColumnName)
            WHEN MATCHED THEN
                UPDATE SET
                    DisplayName = @DisplayName,
                    Category = @Category,
                    IsFilterable = @IsFilterable,
                    IsActive = @IsActive,
                    DataType = @DataType,
                    IsNullable = @IsNullable,
                    UpdatedAt = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (SchemaName, TableName, ColumnName, DataType, IsNullable, DisplayName, Category, IsFilterable, IsActive, UpdatedAt)
                VALUES (@SchemaName, @TableName, @ColumnName, @DataType, @IsNullable, @DisplayName, @Category, @IsFilterable, @IsActive, SYSUTCDATETIME());
        ";

        var affected = 0;
        foreach (var req in requests)
        {
            if (string.IsNullOrWhiteSpace(req.TableName) || string.IsNullOrWhiteSpace(req.ColumnName))
            {
                continue;
            }

            if (!snapshot.Tables.TryGetValue(req.TableName.Trim(), out var tableMeta))
            {
                throw new ArgumentException($"Unknown table '{req.TableName}'. Table must exist in TMS_Lite_1_Oct_2026.");
            }

            var colMeta = tableMeta.Columns.FirstOrDefault(c =>
                string.Equals(c.ColumnName, req.ColumnName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (colMeta is null)
            {
                throw new ArgumentException($"Unknown column '{req.ColumnName}' on table '{req.TableName}'.");
            }

            var displayName = string.IsNullOrWhiteSpace(req.DisplayName)
                ? HumanizeColumnName(colMeta.ColumnName)
                : req.DisplayName.Trim();

            var category = string.IsNullOrWhiteSpace(req.Category)
                ? DeriveTableCategory(tableMeta.TableName)
                : req.Category.Trim();

            await conn.ExecuteAsync(new CommandDefinition(
                upsertSql,
                new
                {
                    SchemaName = tableMeta.SchemaName,
                    TableName = tableMeta.TableName,
                    ColumnName = colMeta.ColumnName,
                    DataType = colMeta.DataType,
                    IsNullable = colMeta.IsNullable,
                    DisplayName = displayName,
                    Category = category,
                    IsFilterable = req.IsFilterable,
                    IsActive = req.IsActive
                },
                transaction: tx,
                cancellationToken: cancellationToken));

            affected++;
        }

        tx.Commit();
        return affected;
    }

    public async Task<int> BulkGovernTableAsync(
        string tableName,
        BulkTableGovernanceRequest request,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        if (!snapshot.Tables.TryGetValue(tableName.Trim(), out var tableMeta))
        {
            throw new ArgumentException($"Unknown table '{tableName}'.");
        }

        var category = !string.IsNullOrWhiteSpace(request.CategoryOverride)
            ? request.CategoryOverride.Trim()
            : DeriveTableCategory(tableMeta.TableName);

        var upsertRequests = tableMeta.Columns.Select(col =>
        {
            var isKeyOrDateOrNo = col.IsPrimaryKey ||
                col.DataType.Contains("date", StringComparison.OrdinalIgnoreCase) ||
                col.ColumnName.EndsWith("_No", StringComparison.OrdinalIgnoreCase) ||
                col.ColumnName.EndsWith("_Code", StringComparison.OrdinalIgnoreCase) ||
                col.ColumnName.EndsWith("_Id", StringComparison.OrdinalIgnoreCase);

            return new UpsertCatalogFieldRequest
            {
                SchemaName = tableMeta.SchemaName,
                TableName = tableMeta.TableName,
                ColumnName = col.ColumnName,
                DisplayName = request.AutoHumanizeAliases ? HumanizeColumnName(col.ColumnName) : col.ColumnName,
                Category = category,
                IsFilterable = request.MarkKeyAndDateColumnsFilterable && isKeyOrDateOrNo,
                IsActive = request.PublishAll
            };
        });

        return await UpsertFieldsAsync(upsertRequests, cancellationToken);
    }

    public async Task<int> SeedDefaultTmsCatalogAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        var totalSeeded = 0;

        foreach (var tableName in CoreTmsSeedTables)
        {
            if (snapshot.Tables.ContainsKey(tableName))
            {
                totalSeeded += await BulkGovernTableAsync(
                    tableName,
                    new BulkTableGovernanceRequest
                    {
                        PublishAll = true,
                        AutoHumanizeAliases = true,
                        MarkKeyAndDateColumnsFilterable = true
                    },
                    cancellationToken);
            }
        }

        return totalSeeded;
    }

    public async Task<IReadOnlyList<CustomRelationshipRecord>> GetCustomRelationshipsAsync(
        CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        const string sql = @"
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
            ORDER BY RelationshipId DESC;
        ";

        var rows = await conn.QueryAsync<CustomRelationshipRecord>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        return rows.ToList();
    }

    public async Task<CustomRelationshipRecord> CreateCustomRelationshipAsync(
        CreateCustomRelationshipRequest request,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);

        if (!snapshot.Tables.TryGetValue(request.ParentTable.Trim(), out var parentTable))
        {
            throw new ArgumentException($"Unknown ParentTable '{request.ParentTable}'.");
        }

        var parentCol = parentTable.Columns.FirstOrDefault(c =>
            string.Equals(c.ColumnName, request.ParentColumn.Trim(), StringComparison.OrdinalIgnoreCase));
        if (parentCol is null)
        {
            throw new ArgumentException($"Unknown ParentColumn '{request.ParentColumn}' on table '{parentTable.TableName}'.");
        }

        if (!snapshot.Tables.TryGetValue(request.ReferencedTable.Trim(), out var refTable))
        {
            throw new ArgumentException($"Unknown ReferencedTable '{request.ReferencedTable}'.");
        }

        var refCol = refTable.Columns.FirstOrDefault(c =>
            string.Equals(c.ColumnName, request.ReferencedColumn.Trim(), StringComparison.OrdinalIgnoreCase));
        if (refCol is null)
        {
            throw new ArgumentException($"Unknown ReferencedColumn '{request.ReferencedColumn}' on table '{refTable.TableName}'.");
        }

        var constraintName = $"VK_{parentTable.TableName}_{parentCol.ColumnName}_{refTable.TableName}_{refCol.ColumnName}";
        var roleLabel = string.IsNullOrWhiteSpace(request.RoleLabel)
            ? SchemaIntrospectionService.DeriveRoleLabel(parentCol.ColumnName, refTable.TableName)
            : request.RoleLabel.Trim();

        using var conn = _connectionFactory.CreateConnection();
        const string upsertRelSql = @"
            MERGE dbo.Report_Custom_Relationships AS target
            USING (SELECT @ConstraintName AS ConstraintName) AS source
            ON (target.ConstraintName = source.ConstraintName)
            WHEN MATCHED THEN
                UPDATE SET
                    ParentSchema = @ParentSchema,
                    ParentTable = @ParentTable,
                    ParentColumn = @ParentColumn,
                    ReferencedSchema = @ReferencedSchema,
                    ReferencedTable = @ReferencedTable,
                    ReferencedColumn = @ReferencedColumn,
                    RoleLabel = @RoleLabel,
                    IsActive = 1
            WHEN NOT MATCHED THEN
                INSERT (ConstraintName, ParentSchema, ParentTable, ParentColumn, ReferencedSchema, ReferencedTable, ReferencedColumn, RoleLabel, IsActive)
                VALUES (@ConstraintName, @ParentSchema, @ParentTable, @ParentColumn, @ReferencedSchema, @ReferencedTable, @ReferencedColumn, @RoleLabel, 1)
            OUTPUT INSERTED.RelationshipId, INSERTED.ConstraintName, INSERTED.ParentSchema, INSERTED.ParentTable, INSERTED.ParentColumn,
                   INSERTED.ReferencedSchema, INSERTED.ReferencedTable, INSERTED.ReferencedColumn, INSERTED.RoleLabel, INSERTED.IsActive, INSERTED.CreatedAt;
        ";

        var created = await conn.QuerySingleAsync<CustomRelationshipRecord>(new CommandDefinition(
            upsertRelSql,
            new
            {
                ConstraintName = constraintName,
                ParentSchema = parentTable.SchemaName,
                ParentTable = parentTable.TableName,
                ParentColumn = parentCol.ColumnName,
                ReferencedSchema = refTable.SchemaName,
                ReferencedTable = refTable.TableName,
                ReferencedColumn = refCol.ColumnName,
                RoleLabel = roleLabel
            },
            cancellationToken: cancellationToken));

        // Immediately reload the in-memory FK multigraph so the Report Designer sees the new relationship without restart
        await _fkGraphService.ReloadGraphAsync(cancellationToken);

        return created;
    }

    public async Task<bool> DeleteCustomRelationshipAsync(
        int relationshipId,
        CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Report_Custom_Relationships WHERE RelationshipId = @Id;",
            new { Id = relationshipId },
            cancellationToken: cancellationToken));

        if (affected > 0)
        {
            await _fkGraphService.ReloadGraphAsync(cancellationToken);
            return true;
        }

        return false;
    }

    public static string HumanizeColumnName(string columnName)
    {
        if (string.IsNullOrWhiteSpace(columnName))
        {
            return string.Empty;
        }

        // Split by underscore or camelCase boundary
        var withSpaces = columnName.Replace('_', ' ');
        withSpaces = Regex.Replace(withSpaces, @"([a-z0-9])([A-Z])", "$1 $2");
        var tokens = withSpaces
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(token =>
            {
                if (PreservedAcronyms.Contains(token))
                {
                    return token.ToUpperInvariant();
                }

                if (token.Equals("No", StringComparison.OrdinalIgnoreCase))
                {
                    return "Number";
                }

                if (token.Equals("Dt", StringComparison.OrdinalIgnoreCase))
                {
                    return "Date";
                }

                if (token.Equals("Amt", StringComparison.OrdinalIgnoreCase))
                {
                    return "Amount";
                }

                if (token.Equals("Qty", StringComparison.OrdinalIgnoreCase))
                {
                    return "Quantity";
                }

                return char.ToUpperInvariant(token[0]) + token[1..].ToLowerInvariant();
            });

        return string.Join(' ', tokens);
    }

    public static string DeriveTableCategory(string tableName)
    {
        if (string.IsNullOrWhiteSpace(tableName))
        {
            return "General";
        }

        if (tableName.StartsWith("CL_Master_", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Master", StringComparison.OrdinalIgnoreCase))
        {
            return "Master Data";
        }

        if (tableName.Contains("Tripsheet", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Thc", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Manifest", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Loading", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("DRS", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("PRS", StringComparison.OrdinalIgnoreCase))
        {
            return "Fleet & Operations";
        }

        if (tableName.Contains("Order", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Docket", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Consignment", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Booking", StringComparison.OrdinalIgnoreCase))
        {
            return "Bookings & Consignments";
        }

        if (tableName.Contains("Bill", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Voucher", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Invoice", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Payment", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Account", StringComparison.OrdinalIgnoreCase) ||
            tableName.Contains("Ledger", StringComparison.OrdinalIgnoreCase))
        {
            return "Finance & Billing";
        }

        return "General Operations";
    }

    private async Task<Dictionary<string, PersistedCatalogRow>> LoadPersistedCatalogMapAsync(
        CancellationToken cancellationToken)
    {
        using var conn = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                FieldId,
                SchemaName,
                TableName,
                ColumnName,
                DataType,
                IsNullable,
                DisplayName,
                Category,
                IsFilterable,
                IsActive
            FROM dbo.Report_Field_Catalog;
        ";

        var rows = await conn.QueryAsync<PersistedCatalogRow>(new CommandDefinition(sql, cancellationToken: cancellationToken));
        var map = new Dictionary<string, PersistedCatalogRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            map[BuildCatalogKey(row.SchemaName, row.TableName, row.ColumnName)] = row;
        }
        return map;
    }

    private static string BuildCatalogKey(string schema, string table, string column) =>
        $"{schema}.{table}.{column}";
}

