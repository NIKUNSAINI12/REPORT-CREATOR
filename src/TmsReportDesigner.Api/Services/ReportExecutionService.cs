using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Dapper;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class ReportExecutionService : IReportExecutionService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITemplateService _templateService;
    private readonly IFkGraphService _fkGraphService;
    private readonly ISqlCompilerService _sqlCompilerService;

    public ReportExecutionService(
        IDbConnectionFactory connectionFactory,
        ITemplateService templateService,
        IFkGraphService fkGraphService,
        ISqlCompilerService sqlCompilerService)
    {
        _connectionFactory = connectionFactory;
        _templateService = templateService;
        _fkGraphService = fkGraphService;
        _sqlCompilerService = sqlCompilerService;
    }

    public async Task<IReadOnlyList<string>> GetFilterLookupValuesAsync(
        string tableName,
        string columnName,
        string? search = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        if (!snapshot.Tables.TryGetValue(tableName.Trim(), out var tableMeta))
        {
            throw new ArgumentException($"Unknown table '{tableName}'.");
        }

        var colMeta = tableMeta.Columns.FirstOrDefault(c =>
            string.Equals(c.ColumnName, columnName.Trim(), StringComparison.OrdinalIgnoreCase));
        if (colMeta is null)
        {
            throw new ArgumentException($"Unknown column '{columnName}' on table '{tableMeta.TableName}'.");
        }

        using var conn = _connectionFactory.CreateConnection();
        var parameters = new DynamicParameters();

        var whereSearch = string.Empty;
        if (!string.IsNullOrWhiteSpace(search))
        {
            whereSearch = $" AND CAST([{tableMeta.SchemaName}].[{tableMeta.TableName}].[{colMeta.ColumnName}] AS NVARCHAR(500)) LIKE @Search";
            parameters.Add("Search", $"%{search.Trim()}%");
        }

        var sql = $@"
            SELECT DISTINCT TOP 500
                CAST([{tableMeta.SchemaName}].[{tableMeta.TableName}].[{colMeta.ColumnName}] AS NVARCHAR(500)) AS Val
            FROM [{tableMeta.SchemaName}].[{tableMeta.TableName}]
            WHERE [{tableMeta.SchemaName}].[{tableMeta.TableName}].[{colMeta.ColumnName}] IS NOT NULL
            {whereSearch}
            ORDER BY Val;
        ";

        var values = await conn.QueryAsync<string>(new CommandDefinition(sql, parameters, cancellationToken: cancellationToken));
        return values.Where(v => !string.IsNullOrWhiteSpace(v)).ToList();
    }

    public async Task<ReportExecutionResponseDto> ExecuteReportAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default)
    {
        var template = await _templateService.GetTemplateByIdAsync(templateId, cancellationToken)
            ?? throw new KeyNotFoundException($"Report template #{templateId} was not found.");

        var layout = JsonSerializer.Deserialize<LayoutDocumentDto>(template.LayoutJson, JsonOptions)
            ?? new LayoutDocumentDto();
        var metadata = JsonSerializer.Deserialize<QueryMetadataDto>(template.QueryMetadataJson, JsonOptions)
            ?? new QueryMetadataDto();

        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);

        // Re-verify / compile SQL from metadata if needed
        var baseSql = template.CompiledSelectQuery;
        if (string.IsNullOrWhiteSpace(baseSql) || !baseSql.Contains("/*DYNAMIC_FILTERS*/", StringComparison.Ordinal))
        {
            var compiled = await _sqlCompilerService.CompileSelectQueryAsync(metadata, cancellationToken);
            baseSql = compiled.CompiledSelectQuery;
        }

        // Build parameterized WHERE clauses (strictly bound via @Param0, @Param1 ... zero string interpolation!)
        var dapperParams = new DynamicParameters();
        var boundParamNames = new List<string>();
        var filterPredicates = new List<string>();
        var paramIndex = 0;

        var inputByFilterId = (request.Filters ?? new List<RuntimeFilterValueInput>())
            .Where(f => !string.IsNullOrWhiteSpace(f.FilterId))
            .ToDictionary(f => f.FilterId, f => f, StringComparer.OrdinalIgnoreCase);

        foreach (var filterDef in metadata.FilterConfig ?? new List<RuntimeFilterConfigDto>())
        {
            inputByFilterId.TryGetValue(filterDef.FilterId, out var userInput);

            // Also check URL query parameter overrides by ColumnName or FilterId
            string? effectiveValue = userInput?.Value;
            if (string.IsNullOrWhiteSpace(effectiveValue) && request.QueryParamOverrides is not null)
            {
                if (request.QueryParamOverrides.TryGetValue(filterDef.ColumnName, out var qpVal) ||
                    request.QueryParamOverrides.TryGetValue(filterDef.FilterId, out qpVal))
                {
                    effectiveValue = qpVal;
                }
            }

            if (string.IsNullOrWhiteSpace(effectiveValue) && !string.IsNullOrWhiteSpace(filterDef.DefaultValue))
            {
                effectiveValue = filterDef.DefaultValue;
            }

            var hasMulti = userInput?.MultiValues is { Count: > 0 };
            if (string.IsNullOrWhiteSpace(effectiveValue) && !hasMulti)
            {
                if (filterDef.IsRequired)
                {
                    throw new ArgumentException($"Required filter '{filterDef.FilterLabel}' ({filterDef.ColumnName}) must be provided.");
                }
                continue;
            }

            // Validate table/column against SchemaGraphSnapshot whitelist
            if (!snapshot.Tables.TryGetValue(filterDef.TableName, out var tblMeta))
            {
                continue;
            }
            var colMeta = tblMeta.Columns.FirstOrDefault(c =>
                string.Equals(c.ColumnName, filterDef.ColumnName, StringComparison.OrdinalIgnoreCase));
            if (colMeta is null)
            {
                continue;
            }

            var tableAlias = string.IsNullOrWhiteSpace(filterDef.TableAlias)
                ? tblMeta.TableName
                : SqlCompilerService.SanitizeAlias(filterDef.TableAlias);

            var qualifiedCol = $"[{tableAlias}].[{colMeta.ColumnName}]";
            var op = (filterDef.Operator ?? "=").Trim().ToUpperInvariant();

            if (op == "IN")
            {
                var rawItems = hasMulti
                    ? userInput!.MultiValues!
                    : (effectiveValue ?? string.Empty)
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .ToList();

                if (rawItems.Count == 0) continue;

                var inParamNames = new List<string>(rawItems.Count);
                foreach (var item in rawItems)
                {
                    var pName = $"Param{paramIndex++}";
                    dapperParams.Add(pName, ConvertParameterValue(item, colMeta.DataType));
                    inParamNames.Add($"@{pName}");
                    boundParamNames.Add($"@{pName}");
                }
                filterPredicates.Add($"AND {qualifiedCol} IN ({string.Join(", ", inParamNames)})");
            }
            else if (op == "BETWEEN")
            {
                var secondVal = userInput?.SecondValue;
                if (string.IsNullOrWhiteSpace(secondVal) && effectiveValue?.Contains("..", StringComparison.Ordinal) == true)
                {
                    var parts = effectiveValue.Split("..", 2);
                    effectiveValue = parts[0].Trim();
                    secondVal = parts[1].Trim();
                }

                var pStart = $"Param{paramIndex++}";
                var pEnd = $"Param{paramIndex++}";
                dapperParams.Add(pStart, ConvertParameterValue(effectiveValue!, colMeta.DataType));
                dapperParams.Add(pEnd, ConvertParameterValue(secondVal ?? effectiveValue!, colMeta.DataType));
                boundParamNames.Add($"@{pStart}");
                boundParamNames.Add($"@{pEnd}");
                filterPredicates.Add($"AND {qualifiedCol} BETWEEN @{pStart} AND @{pEnd}");
            }
            else if (op == "LIKE")
            {
                var pName = $"Param{paramIndex++}";
                var likeVal = effectiveValue!.Contains('%') ? effectiveValue : $"%{effectiveValue}%";
                dapperParams.Add(pName, likeVal);
                boundParamNames.Add($"@{pName}");
                filterPredicates.Add($"AND {qualifiedCol} LIKE @{pName}");
            }
            else
            {
                var safeOp = op switch
                {
                    "=" or "!=" or "<>" or ">" or "<" or ">=" or "<=" => op,
                    _ => "="
                };
                var pName = $"Param{paramIndex++}";
                dapperParams.Add(pName, ConvertParameterValue(effectiveValue!, colMeta.DataType));
                boundParamNames.Add($"@{pName}");
                filterPredicates.Add($"AND {qualifiedCol} {safeOp} @{pName}");
            }
        }

        // Also support direct URL query parameter binding on AnchorTable columns (e.g., ?Tripsheet_Id=10 or ?DocId=10)
        if (request.QueryParamOverrides is { Count: > 0 } &&
            !string.IsNullOrWhiteSpace(metadata.AnchorTable) &&
            snapshot.Tables.TryGetValue(metadata.AnchorTable, out var anchorTableMeta))
        {
            foreach (var kvp in request.QueryParamOverrides)
            {
                if (string.IsNullOrWhiteSpace(kvp.Value)) continue;
                if (string.Equals(kvp.Key, "autoRun", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kvp.Key, "mode", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                // Already handled by FilterConfig?
                if (metadata.FilterConfig.Any(f =>
                        string.Equals(f.ColumnName, kvp.Key, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(f.FilterId, kvp.Key, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                ColumnMetadata? targetCol = null;
                if (string.Equals(kvp.Key, "DocId", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(kvp.Key, "Id", StringComparison.OrdinalIgnoreCase))
                {
                    var pkName = anchorTableMeta.PrimaryKeyColumns.FirstOrDefault();
                    if (pkName is not null)
                    {
                        targetCol = anchorTableMeta.Columns.FirstOrDefault(c =>
                            string.Equals(c.ColumnName, pkName, StringComparison.OrdinalIgnoreCase));
                    }
                }
                else
                {
                    targetCol = anchorTableMeta.Columns.FirstOrDefault(c =>
                        string.Equals(c.ColumnName, kvp.Key, StringComparison.OrdinalIgnoreCase));
                }

                if (targetCol is not null)
                {
                    var pName = $"Param{paramIndex++}";
                    dapperParams.Add(pName, ConvertParameterValue(kvp.Value, targetCol.DataType));
                    boundParamNames.Add($"@{pName}");
                    filterPredicates.Add($"AND [{anchorTableMeta.TableName}].[{targetCol.ColumnName}] = @{pName}");
                }
            }
        }

        var dynamicWhereSql = filterPredicates.Count > 0
            ? string.Join(" ", filterPredicates)
            : string.Empty;

        var finalSql = baseSql.Replace("/*DYNAMIC_FILTERS*/", dynamicWhereSql, StringComparison.Ordinal);

        // Apply safe TOP cap so an unfiltered run on a huge transaction table stays fast
        var maxRows = Math.Clamp(request.MaxRows <= 0 ? 500 : request.MaxRows, 1, 5000);
        if (finalSql.StartsWith("SELECT ", StringComparison.OrdinalIgnoreCase) &&
            !finalSql.StartsWith("SELECT TOP ", StringComparison.OrdinalIgnoreCase) &&
            !finalSql.StartsWith("SELECT DISTINCT", StringComparison.OrdinalIgnoreCase))
        {
            finalSql = $"SELECT TOP ({maxRows}) " + finalSql["SELECT ".Length..];
        }

        using var conn = _connectionFactory.CreateConnection();
        var rawDynamicRows = await conn.QueryAsync(new CommandDefinition(finalSql, dapperParams, cancellationToken: cancellationToken));

        var rows = rawDynamicRows
            .Cast<IDictionary<string, object?>>()
            .Select(r => new Dictionary<string, object?>(r, StringComparer.OrdinalIgnoreCase))
            .ToList();

        var docMode = !string.IsNullOrWhiteSpace(request.OverrideDocumentMode)
            ? request.OverrideDocumentMode!
            : (string.IsNullOrWhiteSpace(metadata.DocumentMode) ? template.DocumentMode : metadata.DocumentMode);

        var documents = RenderMergedDocuments(
            rows,
            layout,
            metadata,
            docMode,
            request.PrintedBy);

        var combinedHtml = BuildCombinedPreviewHtml(documents, layout);

        return new ReportExecutionResponseDto
        {
            TemplateId = template.TemplateId,
            TemplateName = template.TemplateName,
            AnchorTableName = metadata.AnchorTable ?? template.AnchorTableName,
            DocumentMode = docMode,
            ExecutedSql = finalSql,
            BoundParameterNames = boundParamNames,
            TotalMasterRecords = documents.Count,
            TotalRawRows = rows.Count,
            Documents = documents,
            CombinedPreviewHtml = combinedHtml,
            PageSetup = layout.PageSetup,
            Watermark = layout.Watermark,
            ExecutedAtUtc = DateTime.UtcNow
        };
    }

    private static List<RenderedDocumentUnitDto> RenderMergedDocuments(
        List<Dictionary<string, object?>> rows,
        LayoutDocumentDto layout,
        QueryMetadataDto metadata,
        string documentMode,
        string printedBy)
    {
        var now = DateTime.Now;
        var fieldLookup = BuildFieldLookupMap(metadata.SelectedFields);

        if (rows.Count == 0)
        {
            var emptyDoc = RenderSingleDocumentGroup(
                documentIndex: 1,
                totalDocuments: 1,
                pkValue: "No matching records",
                groupRows: new List<Dictionary<string, object?>>(),
                layout: layout,
                metadata: metadata,
                fieldLookup: fieldLookup,
                printedBy: printedBy,
                now: now);
            return new List<RenderedDocumentUnitDto> { emptyDoc };
        }

        // In SummaryList mode, all returned rows are bound into a single continuous document unit
        if (string.Equals(documentMode, "SummaryList", StringComparison.OrdinalIgnoreCase))
        {
            var summaryDoc = RenderSingleDocumentGroup(
                documentIndex: 1,
                totalDocuments: 1,
                pkValue: $"Summary ({rows.Count} rows)",
                groupRows: rows,
                layout: layout,
                metadata: metadata,
                fieldLookup: fieldLookup,
                printedBy: printedBy,
                now: now);
            return new List<RenderedDocumentUnitDto> { summaryDoc };
        }

        // In SingleOrBatchDocument mode (EXEC-03), group rows by [__AnchorPK] so each master record
        // renders its own distinct document with its own repeating child rows and footer aggregates.
        var groupedByPk = rows
            .GroupBy(
                r => r.TryGetValue("__AnchorPK", out var pk) && pk is not null
                    ? Convert.ToString(pk, CultureInfo.InvariantCulture) ?? "1"
                    : "1",
                StringComparer.OrdinalIgnoreCase)
            .ToList();

        var totalDocs = groupedByPk.Count;
        var renderedUnits = new List<RenderedDocumentUnitDto>(totalDocs);
        for (var i = 0; i < totalDocs; i++)
        {
            var grp = groupedByPk[i];
            renderedUnits.Add(RenderSingleDocumentGroup(
                documentIndex: i + 1,
                totalDocuments: totalDocs,
                pkValue: grp.Key,
                groupRows: grp.ToList(),
                layout: layout,
                metadata: metadata,
                fieldLookup: fieldLookup,
                printedBy: printedBy,
                now: now));
        }

        return renderedUnits;
    }

    private static RenderedDocumentUnitDto RenderSingleDocumentGroup(
        int documentIndex,
        int totalDocuments,
        string pkValue,
        List<Dictionary<string, object?>> groupRows,
        LayoutDocumentDto layout,
        QueryMetadataDto metadata,
        Dictionary<string, SelectedFieldDto> fieldLookup,
        string printedBy,
        DateTime now)
    {
        var firstRow = groupRows.FirstOrDefault() ?? new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var scalarValues = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var repeaterRowCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var computedAggregates = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // 1. Expand repeating <tr data-repeater="true"> rows first (deduplicating per child repeater table to prevent Cartesian multiplication)
        var bodyHtml = ExpandRepeatingTableRows(
            layout.BodyHtml ?? string.Empty,
            groupRows,
            metadata,
            fieldLookup,
            repeaterRowCounts,
            computedAggregates);

        // 2. Replace scalar merge tags in Header, Body, and Footer
        var headerHtml = ReplaceMergeTagsInSegment(layout.HeaderHtml ?? string.Empty, firstRow, groupRows, fieldLookup, scalarValues, computedAggregates);
        bodyHtml = ReplaceMergeTagsInSegment(bodyHtml, firstRow, groupRows, fieldLookup, scalarValues, computedAggregates);
        var footerHtml = ReplaceMergeTagsInSegment(layout.FooterHtml ?? string.Empty, firstRow, groupRows, fieldLookup, scalarValues, computedAggregates);

        // 3. Replace System Tokens ({{SYSTEM.PageNumber}}, {{SYSTEM.TotalPages}}, {{SYSTEM.CurrentDate}}, {{SYSTEM.CurrentTime}}, {{SYSTEM.PrintedBy}})
        headerHtml = ReplaceSystemTokens(headerHtml, documentIndex, totalDocuments, printedBy, now);
        bodyHtml = ReplaceSystemTokens(bodyHtml, documentIndex, totalDocuments, printedBy, now);
        footerHtml = ReplaceSystemTokens(footerHtml, documentIndex, totalDocuments, printedBy, now);

        return new RenderedDocumentUnitDto
        {
            DocumentIndex = documentIndex,
            PrimaryKeyValue = pkValue,
            RenderedHeaderHtml = headerHtml,
            RenderedBodyHtml = bodyHtml,
            RenderedFooterHtml = footerHtml,
            ScalarValues = scalarValues,
            RepeaterRowCounts = repeaterRowCounts,
            ComputedAggregates = computedAggregates
        };
    }

    private static string ExpandRepeatingTableRows(
        string html,
        List<Dictionary<string, object?>> groupRows,
        QueryMetadataDto metadata,
        Dictionary<string, SelectedFieldDto> fieldLookup,
        Dictionary<string, int> repeaterRowCounts,
        Dictionary<string, string> computedAggregates)
    {
        if (string.IsNullOrWhiteSpace(html) || !html.Contains("data-repeater", StringComparison.OrdinalIgnoreCase))
        {
            return html;
        }

        // Match any <tr ... data-repeater="true" ...>...</tr>
        var repeaterRegex = new Regex(
            @"<tr\b(?=[^>]*\bdata-repeater\s*=\s*[""']true[""'])(?<attrs>[^>]*)>(?<inner>.*?)</tr>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        return repeaterRegex.Replace(html, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var innerTemplate = match.Groups["inner"].Value;

            var tableAttrMatch = Regex.Match(attrs, @"data-repeater-table\s*=\s*[""'](?<tbl>[^""']+)[""']", RegexOptions.IgnoreCase);
            var repeaterTable = tableAttrMatch.Success ? tableAttrMatch.Groups["tbl"].Value : (metadata.AnchorTable ?? "Repeater");

            // Deduplicate groupRows for this specific repeater table (EXEC-02 Cartesian prevention)
            var deduplicatedRows = DeduplicateRowsForRepeaterTable(groupRows, repeaterTable, innerTemplate, fieldLookup);
            repeaterRowCounts[repeaterTable] = deduplicatedRows.Count;

            if (deduplicatedRows.Count == 0)
            {
                var emptyRowInner = ReplaceMergeTagsInSegment(
                    innerTemplate,
                    new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase),
                    deduplicatedRows,
                    fieldLookup,
                    new Dictionary<string, string>(),
                    computedAggregates);
                return $"<tr{attrs}>{emptyRowInner}</tr>";
            }

            var sb = new StringBuilder();
            foreach (var row in deduplicatedRows)
            {
                var renderedInner = ReplaceMergeTagsInSegment(
                    innerTemplate,
                    row,
                    deduplicatedRows,
                    fieldLookup,
                    new Dictionary<string, string>(),
                    computedAggregates);
                sb.Append($"<tr{attrs}>{renderedInner}</tr>");
            }

            return sb.ToString();
        });
    }

    private static List<Dictionary<string, object?>> DeduplicateRowsForRepeaterTable(
        List<Dictionary<string, object?>> groupRows,
        string repeaterTable,
        string rowTemplateHtml,
        Dictionary<string, SelectedFieldDto> fieldLookup)
    {
        if (groupRows.Count <= 1)
        {
            return groupRows;
        }

        var pkAlias = $"__PK_{SqlCompilerService.SanitizeAlias(repeaterTable)}";
        if (groupRows[0].ContainsKey(pkAlias))
        {
            return groupRows
                .Where(r => r.TryGetValue(pkAlias, out var pkVal) && pkVal is not null)
                .GroupBy(r => Convert.ToString(r[pkAlias], CultureInfo.InvariantCulture) ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();
        }

        // Otherwise deduplicate by the composite signature of columns referenced inside this repeater row
        var referencedKeys = new List<string>();
        foreach (Match m in Regex.Matches(rowTemplateHtml, @"data-alias\s*=\s*[""'](?<alias>[^""']+)[""']", RegexOptions.IgnoreCase))
        {
            referencedKeys.Add(m.Groups["alias"].Value);
        }

        if (referencedKeys.Count == 0)
        {
            foreach (Match m in Regex.Matches(rowTemplateHtml, @"\{\{\s*(?<token>[^\}]+?)\s*\}\}", RegexOptions.IgnoreCase))
            {
                var token = m.Groups["token"].Value.Trim();
                if (fieldLookup.TryGetValue(token, out var fld))
                {
                    referencedKeys.Add(fld.ColumnSqlAlias);
                }
            }
        }

        if (referencedKeys.Count == 0)
        {
            return groupRows;
        }

        var distinctRows = new List<Dictionary<string, object?>>();
        var seenSignatures = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in groupRows)
        {
            var sig = string.Join("||", referencedKeys.Select(k =>
                row.TryGetValue(k, out var val) && val is not null
                    ? Convert.ToString(val, CultureInfo.InvariantCulture)
                    : "NULL"));
            if (seenSignatures.Add(sig))
            {
                distinctRows.Add(row);
            }
        }

        return distinctRows;
    }

    private static string ReplaceMergeTagsInSegment(
        string html,
        Dictionary<string, object?> currentRow,
        List<Dictionary<string, object?>> allGroupRows,
        Dictionary<string, SelectedFieldDto> fieldLookup,
        Dictionary<string, string> scalarOut,
        Dictionary<string, string> aggregateOut)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        // 1. Replace <span class="merge-tag" ...>{{...}}</span> elements carrying inline formatting attributes
        var spanRegex = new Regex(
            @"<span\b[^>]*class\s*=\s*[""'][^""']*merge-tag[^""']*[""'](?<attrs>[^>]*)>(?<inner>.*?)</span>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        var afterSpans = spanRegex.Replace(html, match =>
        {
            var fullTag = match.Value;
            var alias = ExtractAttr(fullTag, "data-alias");
            var table = ExtractAttr(fullTag, "data-table");
            var column = ExtractAttr(fullTag, "data-column");
            var format = ExtractAttr(fullTag, "data-format");
            var transform = ExtractAttr(fullTag, "data-transform");
            var nullDefault = ExtractAttr(fullTag, "data-null-default");
            var aggregate = ExtractAttr(fullTag, "data-aggregate");

            SelectedFieldDto? metaField = null;
            if (!string.IsNullOrWhiteSpace(alias) && fieldLookup.TryGetValue(alias, out var f1)) metaField = f1;
            else if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column) &&
                     fieldLookup.TryGetValue($"{table}.{column}", out var f2)) metaField = f2;

            var effectiveAggregate = !string.IsNullOrWhiteSpace(aggregate)
                ? aggregate!
                : (metaField?.AggregateFunction ?? "NONE");
            var effectiveFormat = !string.IsNullOrWhiteSpace(format) ? format : metaField?.FormatString;
            var effectiveTransform = !string.IsNullOrWhiteSpace(transform) ? transform : metaField?.TextTransform;
            var effectiveNullDefault = !string.IsNullOrWhiteSpace(nullDefault) ? nullDefault : metaField?.NullDefaultValue;

            var rawValue = ResolveRawValue(currentRow, allGroupRows, alias, table, column, metaField, effectiveAggregate);
            var formatted = FormatFieldValue(rawValue, effectiveFormat, effectiveTransform, effectiveNullDefault);

            var keyName = !string.IsNullOrWhiteSpace(alias) ? alias! : $"{table}.{column}";
            if (!string.Equals(effectiveAggregate, "NONE", StringComparison.OrdinalIgnoreCase))
            {
                aggregateOut[$"{effectiveAggregate}({keyName})"] = formatted;
            }
            else
            {
                scalarOut[keyName] = formatted;
            }

            return System.Net.WebUtility.HtmlEncode(formatted);
        });

        // 2. Replace bare {{Table.Field}} or {{SUM(Table.Field)}} tokens
        var tokenRegex = new Regex(@"\{\{\s*(?<token>[^\}]+?)\s*\}\}", RegexOptions.IgnoreCase);
        return tokenRegex.Replace(afterSpans, match =>
        {
            var token = match.Groups["token"].Value.Trim();
            if (token.StartsWith("SYSTEM.", StringComparison.OrdinalIgnoreCase))
            {
                return match.Value; // Handled by ReplaceSystemTokens
            }

            var aggMatch = Regex.Match(token, @"^(?<fn>SUM|COUNT|AVG|MIN|MAX)\((?<inner>.+)\)$", RegexOptions.IgnoreCase);
            var aggFn = aggMatch.Success ? aggMatch.Groups["fn"].Value.ToUpperInvariant() : "NONE";
            var lookupKey = aggMatch.Success ? aggMatch.Groups["inner"].Value.Trim() : token;

            fieldLookup.TryGetValue(lookupKey, out var metaField);
            var rawVal = ResolveRawValue(
                currentRow,
                allGroupRows,
                metaField?.ColumnSqlAlias ?? lookupKey,
                metaField?.TableName,
                metaField?.ColumnName,
                metaField,
                aggFn);

            var formatted = FormatFieldValue(
                rawVal,
                metaField?.FormatString,
                metaField?.TextTransform,
                metaField?.NullDefaultValue);

            if (aggFn != "NONE")
            {
                aggregateOut[$"{aggFn}({lookupKey})"] = formatted;
            }
            else
            {
                scalarOut[lookupKey] = formatted;
            }

            return System.Net.WebUtility.HtmlEncode(formatted);
        });
    }

    private static object? ResolveRawValue(
        Dictionary<string, object?> currentRow,
        List<Dictionary<string, object?>> allGroupRows,
        string? alias,
        string? table,
        string? column,
        SelectedFieldDto? metaField,
        string aggregateFunction)
    {
        string? ResolveKeyInRow(Dictionary<string, object?> row)
        {
            if (!string.IsNullOrWhiteSpace(alias) && row.ContainsKey(alias)) return alias;
            if (metaField is not null && !string.IsNullOrWhiteSpace(metaField.ColumnSqlAlias) && row.ContainsKey(metaField.ColumnSqlAlias))
                return metaField.ColumnSqlAlias;
            if (!string.IsNullOrWhiteSpace(table) && !string.IsNullOrWhiteSpace(column))
            {
                var composite = $"{table}_{column}";
                if (row.ContainsKey(composite)) return composite;
            }
            if (!string.IsNullOrWhiteSpace(column) && row.ContainsKey(column)) return column;
            if (!string.IsNullOrWhiteSpace(alias) && alias.Contains('.'))
            {
                var afterDot = alias.Split('.').Last();
                if (row.ContainsKey(afterDot)) return afterDot;
                var underscore = alias.Replace('.', '_');
                if (row.ContainsKey(underscore)) return underscore;
            }
            return null;
        }

        if (!string.IsNullOrWhiteSpace(aggregateFunction) &&
            !string.Equals(aggregateFunction, "NONE", StringComparison.OrdinalIgnoreCase))
        {
            var fn = aggregateFunction.Trim().ToUpperInvariant();
            if (fn == "COUNT")
            {
                return allGroupRows.Count;
            }

            var numericValues = new List<decimal>();
            foreach (var r in allGroupRows)
            {
                var k = ResolveKeyInRow(r);
                if (k is not null && r.TryGetValue(k, out var v) && v is not null &&
                    decimal.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var dec))
                {
                    numericValues.Add(dec);
                }
            }

            if (numericValues.Count == 0) return 0m;
            return fn switch
            {
                "SUM" => numericValues.Sum(),
                "AVG" => Math.Round(numericValues.Average(), 2),
                "MIN" => numericValues.Min(),
                "MAX" => numericValues.Max(),
                _ => numericValues.Sum()
            };
        }

        var rowKey = ResolveKeyInRow(currentRow);
        return rowKey is not null && currentRow.TryGetValue(rowKey, out var val) ? val : null;
    }

    public static string FormatFieldValue(
        object? rawValue,
        string? formatString,
        string? textTransform,
        string? nullDefaultValue)
    {
        if (rawValue is null || rawValue == DBNull.Value)
        {
            return nullDefaultValue ?? string.Empty;
        }

        string formatted;
        if (!string.IsNullOrWhiteSpace(formatString))
        {
            var fmt = formatString.Trim();
            if (rawValue is DateTime dt || (rawValue is string sDate && DateTime.TryParse(sDate, out dt)))
            {
                // Support both DD-MM-YYYY and standard .NET dd-MM-yyyy tokens
                var netDateFmt = fmt
                    .Replace("DD", "dd", StringComparison.Ordinal)
                    .Replace("YYYY", "yyyy", StringComparison.Ordinal);
                formatted = dt.ToString(netDateFmt, CultureInfo.InvariantCulture);
            }
            else if (decimal.TryParse(Convert.ToString(rawValue, CultureInfo.InvariantCulture), NumberStyles.Any, CultureInfo.InvariantCulture, out var num))
            {
                if (fmt.StartsWith("₹", StringComparison.Ordinal))
                {
                    var pattern = fmt[1..].Trim();
                    formatted = "₹ " + num.ToString(string.IsNullOrWhiteSpace(pattern) ? "#,##0.00" : pattern, CultureInfo.InvariantCulture);
                }
                else if (fmt.StartsWith("$", StringComparison.Ordinal))
                {
                    var pattern = fmt[1..].Trim();
                    formatted = "$ " + num.ToString(string.IsNullOrWhiteSpace(pattern) ? "#,##0.00" : pattern, CultureInfo.InvariantCulture);
                }
                else
                {
                    formatted = num.ToString(fmt, CultureInfo.InvariantCulture);
                }
            }
            else
            {
                formatted = Convert.ToString(rawValue, CultureInfo.InvariantCulture) ?? string.Empty;
            }
        }
        else if (rawValue is DateTime defaultDt)
        {
            formatted = defaultDt.ToString("dd-MM-yyyy", CultureInfo.InvariantCulture);
        }
        else
        {
            formatted = Convert.ToString(rawValue, CultureInfo.InvariantCulture) ?? string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(textTransform))
        {
            formatted = textTransform.Trim().ToLowerInvariant() switch
            {
                "uppercase" or "upper" => formatted.ToUpperInvariant(),
                "lowercase" or "lower" => formatted.ToLowerInvariant(),
                "titlecase" or "title" => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(formatted.ToLowerInvariant()),
                _ => formatted
            };
        }

        return formatted;
    }

    private static string ReplaceSystemTokens(
        string html,
        int pageNumber,
        int totalPages,
        string printedBy,
        DateTime now)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;
        return html
            .Replace("{{SYSTEM.PageNumber}}", pageNumber.ToString(CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase)
            .Replace("{{SYSTEM.TotalPages}}", totalPages.ToString(CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase)
            .Replace("{{SYSTEM.CurrentDate}}", now.ToString("dd-MM-yyyy", CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase)
            .Replace("{{SYSTEM.CurrentTime}}", now.ToString("HH:mm:ss", CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase)
            .Replace("{{SYSTEM.PrintedBy}}", System.Net.WebUtility.HtmlEncode(printedBy), StringComparison.OrdinalIgnoreCase);
    }

    private static Dictionary<string, SelectedFieldDto> BuildFieldLookupMap(List<SelectedFieldDto>? fields)
    {
        var map = new Dictionary<string, SelectedFieldDto>(StringComparer.OrdinalIgnoreCase);
        if (fields is null) return map;

        foreach (var f in fields)
        {
            if (!string.IsNullOrWhiteSpace(f.ColumnSqlAlias))
                map[f.ColumnSqlAlias] = f;
            if (!string.IsNullOrWhiteSpace(f.TableName) && !string.IsNullOrWhiteSpace(f.ColumnName))
                map[$"{f.TableName}.{f.ColumnName}"] = f;
            if (!string.IsNullOrWhiteSpace(f.TableName) && !string.IsNullOrWhiteSpace(f.DisplayName))
                map[$"{f.TableName}.{f.DisplayName}"] = f;
            if (!string.IsNullOrWhiteSpace(f.TableAlias) && !string.IsNullOrWhiteSpace(f.DisplayName))
                map[$"{f.TableAlias}.{f.DisplayName}"] = f;
            if (!string.IsNullOrWhiteSpace(f.TableAlias) && !string.IsNullOrWhiteSpace(f.ColumnName))
                map[$"{f.TableAlias}.{f.ColumnName}"] = f;
        }

        return map;
    }

    private static string? ExtractAttr(string tagHtml, string attrName)
    {
        var m = Regex.Match(tagHtml, $@"\b{Regex.Escape(attrName)}\s*=\s*[""'](?<val>[^""']*)[""']", RegexOptions.IgnoreCase);
        return m.Success ? System.Net.WebUtility.HtmlDecode(m.Groups["val"].Value) : null;
    }

    private static object ConvertParameterValue(string rawValue, string sqlDataType)
    {
        var dt = (sqlDataType ?? "varchar").ToLowerInvariant();
        if (dt.Contains("int") && long.TryParse(rawValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var lVal))
            return lVal;
        if ((dt.Contains("decimal") || dt.Contains("numeric") || dt.Contains("money") || dt.Contains("float")) &&
            decimal.TryParse(rawValue, NumberStyles.Any, CultureInfo.InvariantCulture, out var dVal))
            return dVal;
        if (dt.Contains("bit") && bool.TryParse(rawValue, out var bVal))
            return bVal;
        if (dt.Contains("date") && DateTime.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateVal))
            return dateVal;
        return rawValue;
    }

    private static string BuildCombinedPreviewHtml(List<RenderedDocumentUnitDto> documents, LayoutDocumentDto layout)
    {
        var ps = layout.PageSetup ?? new PageSetupDto();
        var wm = layout.Watermark ?? new WatermarkDto();
        var isLandscape = string.Equals(ps.Orientation, "Landscape", StringComparison.OrdinalIgnoreCase);
        var widthMm = isLandscape ? Math.Max(ps.WidthMm, ps.HeightMm) : Math.Min(ps.WidthMm, ps.HeightMm);
        var heightMm = isLandscape ? Math.Min(ps.WidthMm, ps.HeightMm) : Math.Max(ps.WidthMm, ps.HeightMm);

        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>");
        sb.AppendLine("<style>");
        sb.AppendLine($"@page {{ size: {widthMm}mm {heightMm}mm; margin: 0; }}");
        sb.AppendLine("body { margin: 0; padding: 0; font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #0f172a; background: #e2e8f0; }");
        sb.AppendLine($".report-page {{ position: relative; box-sizing: border-box; width: {widthMm}mm; min-height: {heightMm}mm; padding: {ps.MarginTopMm}mm {ps.MarginRightMm}mm {ps.MarginBottomMm}mm {ps.MarginLeftMm}mm; background: #ffffff; margin: 16px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.12); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }}");
        sb.AppendLine("@media print { body { background: #ffffff; } .report-page { margin: 0; box-shadow: none; page-break-after: always; break-after: page; } .report-page:last-child { page-break-after: auto; break-after: auto; } }");
        sb.AppendLine($".report-body {{ flex: 1; column-count: {Math.Clamp(ps.Columns, 1, 3)}; column-gap: 8mm; position: relative; z-index: 2; }}");
        sb.AppendLine(".report-header, .report-footer { position: relative; z-index: 2; }");
        sb.AppendLine(".report-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 1; user-select: none; }");
        sb.AppendLine("table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 8px; } thead { display: table-header-group; }");
        sb.AppendLine("</style></head><body>");

        for (var i = 0; i < documents.Count; i++)
        {
            var doc = documents[i];
            sb.AppendLine("<section class=\"report-page\">");
            if (wm.Enabled)
            {
                if (string.Equals(wm.Type, "Image", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(wm.ImageUrl))
                {
                    sb.AppendLine($"<div class=\"report-watermark\" style=\"opacity:{wm.Opacity.ToString(CultureInfo.InvariantCulture)};\"><img src=\"{wm.ImageUrl}\" style=\"max-width:65%;max-height:65%;transform:rotate({wm.RotationDeg}deg);\"/></div>");
                }
                else if (!string.IsNullOrWhiteSpace(wm.Text))
                {
                    sb.AppendLine($"<div class=\"report-watermark\" style=\"opacity:{wm.Opacity.ToString(CultureInfo.InvariantCulture)};color:{wm.Color};font-size:{wm.FontSizePt}pt;font-weight:800;transform:rotate({wm.RotationDeg}deg);\">{System.Net.WebUtility.HtmlEncode(wm.Text)}</div>");
                }
            }

            sb.AppendLine($"<header class=\"report-header\">{doc.RenderedHeaderHtml}</header>");
            sb.AppendLine($"<main class=\"report-body\">{doc.RenderedBodyHtml}</main>");
            sb.AppendLine($"<footer class=\"report-footer\">{doc.RenderedFooterHtml}</footer>");
            sb.AppendLine("</section>");
        }

        sb.AppendLine("</body></html>");
        return sb.ToString();
    }

    public async Task<byte[]> ExportDocxAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default)
    {
        var execution = await ExecuteReportAsync(templateId, request, cancellationToken);
        var ps = execution.PageSetup ?? new PageSetupDto();
        var wm = execution.Watermark ?? new WatermarkDto();

        using var ms = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document, true))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            mainPart.Document = new Document();
            var body = new Body();

            // Create HeaderPart & FooterPart if header/footer content or watermark exists
            string? headerPartId = null;
            string? footerPartId = null;

            var firstDoc = execution.Documents.FirstOrDefault();
            if (firstDoc is not null && (!string.IsNullOrWhiteSpace(firstDoc.RenderedHeaderHtml) || wm.Enabled))
            {
                var headerPart = mainPart.AddNewPart<HeaderPart>();
                headerPartId = mainPart.GetIdOfPart(headerPart);
                var header = new Header();
                if (wm.Enabled && !string.IsNullOrWhiteSpace(wm.Text))
                {
                    header.Append(CreateParagraphFromText($"[WATERMARK: {wm.Text}]", isBold: true, fontSizeHalfPt: "20", colorHex: "94A3B8", JustificationValues.Center));
                }
                foreach (var p in ConvertHtmlFragmentToOpenXmlElements(firstDoc.RenderedHeaderHtml))
                {
                    header.Append(p);
                }
                headerPart.Header = header;
                headerPart.Header.Save();
            }

            if (firstDoc is not null && !string.IsNullOrWhiteSpace(firstDoc.RenderedFooterHtml))
            {
                var footerPart = mainPart.AddNewPart<FooterPart>();
                footerPartId = mainPart.GetIdOfPart(footerPart);
                var footer = new Footer();
                foreach (var p in ConvertHtmlFragmentToOpenXmlElements(firstDoc.RenderedFooterHtml))
                {
                    footer.Append(p);
                }
                footerPart.Footer = footer;
                footerPart.Footer.Save();
            }

            for (var i = 0; i < execution.Documents.Count; i++)
            {
                var docUnit = execution.Documents[i];
                var elements = ConvertHtmlFragmentToOpenXmlElements(docUnit.RenderedBodyHtml);
                foreach (var el in elements)
                {
                    body.Append(el);
                }

                // Inject native Word page break between batch documents
                if (i < execution.Documents.Count - 1)
                {
                    body.Append(new Paragraph(new Run(new Break { Type = BreakValues.Page })));
                }
            }

            // Configure exact WordprocessingML SectionProperties (PageSize in twips: 1mm = 56.6929 twips)
            var isLandscape = string.Equals(ps.Orientation, "Landscape", StringComparison.OrdinalIgnoreCase);
            var wMm = isLandscape ? Math.Max(ps.WidthMm, ps.HeightMm) : Math.Min(ps.WidthMm, ps.HeightMm);
            var hMm = isLandscape ? Math.Min(ps.WidthMm, ps.HeightMm) : Math.Max(ps.WidthMm, ps.HeightMm);

            uint MmToTwipsUInt(double mm) => (uint)Math.Max(144, Math.Round(mm * 56.6929));
            int MmToTwipsInt(double mm) => (int)Math.Max(144, Math.Round(mm * 56.6929));

            var sectPr = new SectionProperties();
            if (headerPartId is not null)
            {
                sectPr.Append(new HeaderReference { Type = HeaderFooterValues.Default, Id = headerPartId });
            }
            if (footerPartId is not null)
            {
                sectPr.Append(new FooterReference { Type = HeaderFooterValues.Default, Id = footerPartId });
            }

            sectPr.Append(new PageSize
            {
                Width = MmToTwipsUInt(wMm),
                Height = MmToTwipsUInt(hMm),
                Orient = isLandscape ? PageOrientationValues.Landscape : PageOrientationValues.Portrait
            });

            sectPr.Append(new PageMargin
            {
                Top = MmToTwipsInt(ps.MarginTopMm),
                Bottom = MmToTwipsInt(ps.MarginBottomMm),
                Left = MmToTwipsUInt(ps.MarginLeftMm),
                Right = MmToTwipsUInt(ps.MarginRightMm),
                Header = 720U,
                Footer = 720U
            });

            if (ps.Columns > 1)
            {
                sectPr.Append(new Columns { ColumnCount = (short)Math.Clamp(ps.Columns, 1, 3), Space = "450" });
            }

            body.Append(sectPr);
            mainPart.Document.Append(body);
            mainPart.Document.Save();
        }

        return ms.ToArray();
    }

    private static List<OpenXmlCompositeElement> ConvertHtmlFragmentToOpenXmlElements(string html)
    {
        var result = new List<OpenXmlCompositeElement>();
        if (string.IsNullOrWhiteSpace(html))
        {
            return result;
        }

        // Split HTML into tables and non-table blocks so Word tables render as native w:tbl
        var tableRegex = new Regex(@"<table\b[^>]*>(?<tbl>.*?)</table>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var lastIdx = 0;

        foreach (Match match in tableRegex.Matches(html))
        {
            if (match.Index > lastIdx)
            {
                var beforeHtml = html[lastIdx..match.Index];
                result.AddRange(ConvertTextBlocksToParagraphs(beforeHtml));
            }

            result.Add(ConvertHtmlTableToWordTable(match.Groups["tbl"].Value));
            lastIdx = match.Index + match.Length;
        }

        if (lastIdx < html.Length)
        {
            result.AddRange(ConvertTextBlocksToParagraphs(html[lastIdx..]));
        }

        return result;
    }

    private static List<OpenXmlCompositeElement> ConvertTextBlocksToParagraphs(string htmlSegment)
    {
        var list = new List<OpenXmlCompositeElement>();
        var blockSplit = Regex.Split(htmlSegment, @"</(?:p|div|h1|h2|h3|h4|h5|h6|li|blockquote)>|<br\s*/?>|<hr\s*/?>", RegexOptions.IgnoreCase);
        foreach (var rawBlock in blockSplit)
        {
            var isHeading1 = Regex.IsMatch(rawBlock, @"<h1\b", RegexOptions.IgnoreCase);
            var isHeading2 = Regex.IsMatch(rawBlock, @"<h2\b", RegexOptions.IgnoreCase);
            var isBold = isHeading1 || isHeading2 || Regex.IsMatch(rawBlock, @"<(?:strong|b)\b", RegexOptions.IgnoreCase);
            var plain = StripHtmlTags(rawBlock);
            if (string.IsNullOrWhiteSpace(plain)) continue;

            var fontSize = isHeading1 ? "32" : isHeading2 ? "26" : "22";
            var color = isHeading1 ? "1E3A8A" : "0F172A";
            list.Add(CreateParagraphFromText(plain, isBold, fontSize, color, JustificationValues.Left));
        }
        return list;
    }

    private static Table ConvertHtmlTableToWordTable(string innerTableHtml)
    {
        var table = new Table();
        var tblProps = new TableProperties(
            new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct },
            new TableBorders(
                new TopBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" },
                new BottomBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" },
                new LeftBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" },
                new RightBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" },
                new InsideHorizontalBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" },
                new InsideVerticalBorder { Val = new EnumValue<BorderValues>(BorderValues.Single), Size = 6, Color = "CBD5E1" }
            ));
        table.AppendChild(tblProps);

        var rowRegex = new Regex(@"<tr(?<attrs>[^>]*)>(?<cells>.*?)</tr>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var cellRegex = new Regex(@"<(?<tag>th|td)(?<cattrs>[^>]*)>(?<val>.*?)</\k<tag>>", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        foreach (Match rowMatch in rowRegex.Matches(innerTableHtml))
        {
            var tr = new TableRow();
            var isHeaderRow = rowMatch.Groups["attrs"].Value.Contains("data-repeat-header", StringComparison.OrdinalIgnoreCase) ||
                              rowMatch.Groups["cells"].Value.Contains("<th", StringComparison.OrdinalIgnoreCase);

            if (isHeaderRow)
            {
                tr.AppendChild(new TableRowProperties(new TableHeader()));
            }

            foreach (Match cellMatch in cellRegex.Matches(rowMatch.Groups["cells"].Value))
            {
                var text = StripHtmlTags(cellMatch.Groups["val"].Value);
                var tc = new TableCell();
                var tcProps = new TableCellProperties(
                    new TableCellWidth { Type = TableWidthUnitValues.Auto });
                if (isHeaderRow)
                {
                    tcProps.Append(new Shading
                    {
                        Val = ShadingPatternValues.Clear,
                        Color = "auto",
                        Fill = "1E3A8A"
                    });
                }
                tc.Append(tcProps);
                tc.Append(CreateParagraphFromText(
                    text,
                    isBold: isHeaderRow,
                    fontSizeHalfPt: "20",
                    colorHex: isHeaderRow ? "FFFFFF" : "0F172A",
                    JustificationValues.Left));
                tr.Append(tc);
            }

            if (tr.Elements<TableCell>().Any())
            {
                table.Append(tr);
            }
        }

        if (!table.Elements<TableRow>().Any())
        {
            var fallbackRow = new TableRow(new TableCell(CreateParagraphFromText("Empty Table", false, "20", "0F172A", JustificationValues.Left)));
            table.Append(fallbackRow);
        }

        return table;
    }

    private static Paragraph CreateParagraphFromText(
        string text,
        bool isBold,
        string fontSizeHalfPt,
        string colorHex,
        JustificationValues align)
    {
        var runProps = new RunProperties(
            new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri" },
            new FontSize { Val = fontSizeHalfPt },
            new Color { Val = colorHex });
        if (isBold)
        {
            runProps.Append(new Bold());
        }

        var run = new Run(runProps, new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        var pProps = new ParagraphProperties(new Justification { Val = align });
        return new Paragraph(pProps, run);
    }

    private static string StripHtmlTags(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var stripped = Regex.Replace(input, @"<[^>]+>", " ");
        stripped = System.Net.WebUtility.HtmlDecode(stripped);
        return Regex.Replace(stripped, @"\s+", " ").Trim();
    }

    public async Task<byte[]> ExportPdfAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default)
    {
        var execution = await ExecuteReportAsync(templateId, request, cancellationToken);

        // Try headless Microsoft Edge or Chrome if installed on Windows for 100% Chromium CSS @page fidelity
        var browserExe = FindLocalChromiumExecutable();
        if (browserExe is not null)
        {
            var tempHtmlPath = Path.Combine(Path.GetTempPath(), $"tms_report_{Guid.NewGuid():N}.html");
            var tempPdfPath = Path.Combine(Path.GetTempPath(), $"tms_report_{Guid.NewGuid():N}.pdf");
            try
            {
                await File.WriteAllTextAsync(tempHtmlPath, execution.CombinedPreviewHtml, Encoding.UTF8, cancellationToken);
                var psi = new ProcessStartInfo
                {
                    FileName = browserExe,
                    Arguments = $"--headless --disable-gpu --no-pdf-header-footer --print-to-pdf=\"{tempPdfPath}\" \"{new Uri(tempHtmlPath).AbsoluteUri}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                using var proc = Process.Start(psi);
                if (proc is not null)
                {
                    await proc.WaitForExitAsync(cancellationToken);
                    if (File.Exists(tempPdfPath))
                    {
                        var bytes = await File.ReadAllBytesAsync(tempPdfPath, cancellationToken);
                        if (bytes.Length > 100)
                        {
                            return bytes;
                        }
                    }
                }
            }
            catch
            {
                // Fallback to built-in standards-compliant PDF 1.4 generator below
            }
            finally
            {
                try { if (File.Exists(tempHtmlPath)) File.Delete(tempHtmlPath); } catch { }
                try { if (File.Exists(tempPdfPath)) File.Delete(tempPdfPath); } catch { }
            }
        }

        return BuildFallbackPdfBytes(execution);
    }

    private static string? FindLocalChromiumExecutable()
    {
        string[] candidates =
        {
            @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Google\Chrome\Application\chrome.exe",
            @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static byte[] BuildFallbackPdfBytes(ReportExecutionResponseDto execution)
    {
        // Construct a valid multi-line PDF 1.4 document containing the report title and rendered content
        var lines = new List<string>
        {
            $"TMS Report: {execution.TemplateName}",
            $"Anchor Table: {execution.AnchorTableName} | Records: {execution.TotalMasterRecords}",
            $"Executed At: {execution.ExecutedAtUtc:yyyy-MM-dd HH:mm:ss} UTC",
            "------------------------------------------------------------------------"
        };

        foreach (var doc in execution.Documents)
        {
            lines.Add($"Document #{doc.DocumentIndex} (PK: {doc.PrimaryKeyValue})");
            var bodyPlain = StripHtmlTags(doc.RenderedBodyHtml);
            if (bodyPlain.Length > 90)
            {
                for (var idx = 0; idx < bodyPlain.Length; idx += 90)
                {
                    lines.Add(bodyPlain.Substring(idx, Math.Min(90, bodyPlain.Length - idx)));
                }
            }
            else
            {
                lines.Add(bodyPlain);
            }
            lines.Add(" ");
        }

        var contentSb = new StringBuilder();
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F1 10 Tf");
        var y = 790;
        foreach (var line in lines.Take(65))
        {
            var safe = line.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
            contentSb.AppendLine($"1 0 0 1 40 {y} Tm ({safe}) Tj");
            y -= 12;
        }
        contentSb.AppendLine("ET");
        var streamContent = contentSb.ToString();

        var pdf = $@"%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length {Encoding.ASCII.GetByteCount(streamContent)} >>
stream
{streamContent}endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000297 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
{350 + Encoding.ASCII.GetByteCount(streamContent)}
%%EOF";

        return Encoding.ASCII.GetBytes(pdf);
    }
}

