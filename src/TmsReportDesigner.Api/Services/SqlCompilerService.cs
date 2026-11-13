using System.Text;
using System.Text.RegularExpressions;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class SqlCompilerService : ISqlCompilerService
{
    private readonly IFkGraphService _fkGraphService;
    private readonly IReachabilityService _reachabilityService;

    public SqlCompilerService(IFkGraphService fkGraphService, IReachabilityService reachabilityService)
    {
        _fkGraphService = fkGraphService;
        _reachabilityService = reachabilityService;
    }

    public async Task<SqlCompileResultDto> CompileSelectQueryAsync(
        QueryMetadataDto metadata,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);

        var selectedFields = metadata.SelectedFields ?? new List<SelectedFieldDto>();
        var filters = metadata.FilterConfig ?? new List<RuntimeFilterConfigDto>();

        var anchorTable = metadata.AnchorTable;
        if (string.IsNullOrWhiteSpace(anchorTable) && selectedFields.Count > 0)
        {
            anchorTable = selectedFields[0].TableName;
        }

        if (string.IsNullOrWhiteSpace(anchorTable))
        {
            return new SqlCompileResultDto
            {
                CompiledSelectQuery = "SELECT 1 AS [EmptyReport] WHERE 1=1 /*DYNAMIC_FILTERS*/",
                AnchorTable = null,
                ResolvedJoinPath = Array.Empty<JoinStepDto>(),
                NormalizedFields = Array.Empty<SelectedFieldDto>()
            };
        }

        if (!snapshot.Tables.TryGetValue(anchorTable.Trim(), out var anchorMeta))
        {
            throw new ArgumentException($"Anchor table '{anchorTable}' does not exist in schema catalog.");
        }

        anchorTable = anchorMeta.TableName;

        // Collect all distinct tables referenced by selected fields or runtime filters
        var activeTables = new List<string> { anchorTable };
        foreach (var f in selectedFields)
        {
            if (!string.IsNullOrWhiteSpace(f.TableName) &&
                !activeTables.Contains(f.TableName, StringComparer.OrdinalIgnoreCase))
            {
                if (!snapshot.Tables.TryGetValue(f.TableName.Trim(), out var tblMeta))
                {
                    throw new ArgumentException($"Selected field table '{f.TableName}' does not exist in schema catalog.");
                }
                activeTables.Add(tblMeta.TableName);
            }
        }

        foreach (var flt in filters)
        {
            if (!string.IsNullOrWhiteSpace(flt.TableName) &&
                !activeTables.Contains(flt.TableName, StringComparer.OrdinalIgnoreCase))
            {
                if (!snapshot.Tables.TryGetValue(flt.TableName.Trim(), out var tblMeta))
                {
                    throw new ArgumentException($"Filter table '{flt.TableName}' does not exist in schema catalog.");
                }
                activeTables.Add(tblMeta.TableName);
            }
        }

        // Compute shortest LEFT JOIN path across the FK multigraph (including intermediate bridge tables)
        var reachability = await _reachabilityService.ComputeReachabilityAsync(
            new ReachabilityRequest
            {
                ActiveTables = activeTables,
                SelectedRoleConstraints = metadata.SelectedRoleConstraints
            },
            cancellationToken);

        // Verify all active tables are reachable from AnchorTable
        foreach (var tbl in activeTables.Skip(1))
        {
            if (!reachability.TableDetails.TryGetValue(tbl, out var info) || !info.IsReachable)
            {
                throw new InvalidOperationException(
                    $"Table '{tbl}' is not reachable via Foreign Key from anchor table '{anchorTable}'.");
            }
        }

        var joinSteps = reachability.ResolvedJoinPath.ToList();

        // Also include any explicit role-aliased joins if the same lookup table is joined multiple times with different role constraints
        foreach (var field in selectedFields)
        {
            if (!string.IsNullOrWhiteSpace(field.RoleConstraintName) &&
                !string.Equals(field.TableName, anchorTable, StringComparison.OrdinalIgnoreCase) &&
                snapshot.AdjacencyList.TryGetValue(anchorTable, out var anchorEdges))
            {
                var explicitEdge = anchorEdges.FirstOrDefault(e =>
                    string.Equals(e.ConstraintName, field.RoleConstraintName, StringComparison.OrdinalIgnoreCase));
                if (explicitEdge is not null)
                {
                    var explicitAlias = !string.IsNullOrWhiteSpace(field.TableAlias)
                        ? SanitizeAlias(field.TableAlias)
                        : ReachabilityService.BuildSuggestedAlias(
                            explicitEdge.ToTable,
                            explicitEdge.ColumnPairs.FirstOrDefault()?.ParentColumn ?? explicitEdge.ConstraintName);

                    if (!joinSteps.Any(j => string.Equals(j.ToAlias, explicitAlias, StringComparison.OrdinalIgnoreCase)))
                    {
                        var pred = string.Join(
                            " AND ",
                            explicitEdge.ColumnPairs.Select(cp =>
                                $"[{anchorTable}].[{cp.ParentColumn}] = [{explicitAlias}].[{cp.ReferencedColumn}]"));

                        joinSteps.Add(new JoinStepDto(
                            FromTable: anchorTable,
                            FromAlias: anchorTable,
                            ToTable: explicitEdge.ToTable,
                            ToAlias: explicitAlias,
                            ConstraintName: explicitEdge.ConstraintName,
                            RoleLabel: explicitEdge.RoleLabel,
                            Cardinality: explicitEdge.Cardinality,
                            ColumnPairs: explicitEdge.ColumnPairs,
                            JoinPredicateSql: pred));
                    }
                }
            }
        }

        // Map each table to its default resolved alias in the join path
        var aliasByTable = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [anchorTable] = anchorTable
        };
        foreach (var step in joinSteps)
        {
            if (!aliasByTable.ContainsKey(step.ToTable))
            {
                aliasByTable[step.ToTable] = step.ToAlias;
            }
        }

        var selectProjections = new List<string>();
        var usedProjectionAliases = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Always project Anchor Primary Key as [__AnchorPK] for Single/Batch document grouping & multi-repeater stitching
        var anchorPkCol = anchorMeta.PrimaryKeyColumns.FirstOrDefault()
            ?? anchorMeta.Columns.First().ColumnName;
        selectProjections.Add($"[{anchorTable}].[{anchorPkCol}] AS [__AnchorPK]");
        usedProjectionAliases.Add("__AnchorPK");

        var normalizedFields = new List<SelectedFieldDto>(selectedFields.Count);
        foreach (var f in selectedFields)
        {
            if (!snapshot.Tables.TryGetValue(f.TableName.Trim(), out var tblMeta))
            {
                continue;
            }

            var colMeta = tblMeta.Columns.FirstOrDefault(c =>
                string.Equals(c.ColumnName, f.ColumnName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (colMeta is null)
            {
                throw new ArgumentException($"Column '{f.ColumnName}' does not exist on table '{tblMeta.TableName}'.");
            }

            var tableAlias = !string.IsNullOrWhiteSpace(f.TableAlias) &&
                             (string.Equals(f.TableAlias, anchorTable, StringComparison.OrdinalIgnoreCase) ||
                              joinSteps.Any(j => string.Equals(j.ToAlias, f.TableAlias, StringComparison.OrdinalIgnoreCase)))
                ? f.TableAlias
                : aliasByTable.GetValueOrDefault(tblMeta.TableName, tblMeta.TableName);

            var colSqlAlias = !string.IsNullOrWhiteSpace(f.ColumnSqlAlias)
                ? SanitizeAlias(f.ColumnSqlAlias)
                : SanitizeAlias($"{tableAlias}_{colMeta.ColumnName}");

            var normalized = new SelectedFieldDto
            {
                FieldId = f.FieldId,
                SchemaName = tblMeta.SchemaName,
                TableName = tblMeta.TableName,
                ColumnName = colMeta.ColumnName,
                TableAlias = tableAlias,
                ColumnSqlAlias = colSqlAlias,
                DisplayName = string.IsNullOrWhiteSpace(f.DisplayName)
                    ? CatalogService.HumanizeColumnName(colMeta.ColumnName)
                    : f.DisplayName,
                DataType = colMeta.DataType,
                FormatString = f.FormatString,
                TextTransform = f.TextTransform,
                NullDefaultValue = f.NullDefaultValue,
                AggregateFunction = string.IsNullOrWhiteSpace(f.AggregateFunction) ? "NONE" : f.AggregateFunction.ToUpperInvariant(),
                IsRepeaterField = f.IsRepeaterField,
                RepeaterTableName = f.RepeaterTableName,
                RoleConstraintName = f.RoleConstraintName,
                RoleLabel = f.RoleLabel
            };
            normalizedFields.Add(normalized);

            if (usedProjectionAliases.Add(colSqlAlias))
            {
                selectProjections.Add($"[{tableAlias}].[{colMeta.ColumnName}] AS [{colSqlAlias}]");
            }
        }

        // Also project primary key columns of any joined 1:N repeater tables so ReportExecutionService can deduplicate rows per child table
        foreach (var step in joinSteps.Where(s => s.Cardinality == FkCardinality.OneToMany))
        {
            if (snapshot.Tables.TryGetValue(step.ToTable, out var childTblMeta))
            {
                var childPk = childTblMeta.PrimaryKeyColumns.FirstOrDefault()
                    ?? childTblMeta.Columns.First().ColumnName;
                var pkAlias = $"__PK_{SanitizeAlias(step.ToAlias)}";
                if (usedProjectionAliases.Add(pkAlias))
                {
                    selectProjections.Add($"[{step.ToAlias}].[{childPk}] AS [{pkAlias}]");
                }
            }
        }

        var sb = new StringBuilder();
        sb.AppendLine($"SELECT {string.Join(", ", selectProjections)}");
        sb.AppendLine($"FROM [{anchorMeta.SchemaName}].[{anchorMeta.TableName}] AS [{anchorTable}]");

        foreach (var step in joinSteps)
        {
            var toSchema = snapshot.Tables.TryGetValue(step.ToTable, out var toMeta) ? toMeta.SchemaName : "dbo";
            sb.AppendLine($"LEFT JOIN [{toSchema}].[{step.ToTable}] AS [{step.ToAlias}] ON {step.JoinPredicateSql}");
        }

        sb.Append("WHERE 1=1 /*DYNAMIC_FILTERS*/");

        return new SqlCompileResultDto
        {
            CompiledSelectQuery = sb.ToString().Trim(),
            AnchorTable = anchorTable,
            ResolvedJoinPath = joinSteps,
            NormalizedFields = normalizedFields
        };
    }

    public static string SanitizeAlias(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "Col";
        }
        return Regex.Replace(raw.Trim(), @"[^a-zA-Z0-9_]", "_");
    }
}
