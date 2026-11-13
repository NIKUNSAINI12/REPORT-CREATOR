using System.Text.Json;
using Dapper;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class TemplateService : ITemplateService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ISqlCompilerService _sqlCompilerService;
    private readonly IFkGraphService _fkGraphService;

    public TemplateService(
        IDbConnectionFactory connectionFactory,
        ISqlCompilerService sqlCompilerService,
        IFkGraphService fkGraphService)
    {
        _connectionFactory = connectionFactory;
        _sqlCompilerService = sqlCompilerService;
        _fkGraphService = fkGraphService;
    }

    public async Task<IReadOnlyList<SavedReportTemplateDto>> GetTemplatesAsync(CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                TemplateId,
                TemplateName,
                Description,
                AnchorTableName,
                DocumentMode,
                LayoutJson,
                QueryMetadataJson,
                CompiledSelectQuery,
                IsActive,
                CreatedAt,
                UpdatedAt
            FROM dbo.Saved_Report_Templates
            WHERE IsActive = 1
            ORDER BY UpdatedAt DESC, TemplateId DESC;
        ";

        var list = (await conn.QueryAsync<SavedReportTemplateDto>(new CommandDefinition(sql, cancellationToken: cancellationToken))).ToList();
        if (list.Count == 0)
        {
            var seeded = await EnsureDefaultSampleTemplateAsync(cancellationToken);
            list.Add(seeded);
        }

        return list;
    }

    public async Task<SavedReportTemplateDto?> GetTemplateByIdAsync(int templateId, CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT
                TemplateId,
                TemplateName,
                Description,
                AnchorTableName,
                DocumentMode,
                LayoutJson,
                QueryMetadataJson,
                CompiledSelectQuery,
                IsActive,
                CreatedAt,
                UpdatedAt
            FROM dbo.Saved_Report_Templates
            WHERE TemplateId = @TemplateId AND IsActive = 1;
        ";

        return await conn.QueryFirstOrDefaultAsync<SavedReportTemplateDto>(
            new CommandDefinition(sql, new { TemplateId = templateId }, cancellationToken: cancellationToken));
    }

    public async Task<SavedReportTemplateDto> SaveTemplateAsync(
        SaveReportTemplateRequest request,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.TemplateName))
        {
            throw new ArgumentException("TemplateName is required.");
        }

        var metadata = request.QueryMetadata ?? new QueryMetadataDto();
        if (!string.IsNullOrWhiteSpace(request.AnchorTableName) && string.IsNullOrWhiteSpace(metadata.AnchorTable))
        {
            metadata.AnchorTable = request.AnchorTableName;
        }
        metadata.DocumentMode = string.IsNullOrWhiteSpace(request.DocumentMode)
            ? "SingleOrBatchDocument"
            : request.DocumentMode;

        var compileResult = await _sqlCompilerService.CompileSelectQueryAsync(metadata, cancellationToken);

        metadata.AnchorTable = compileResult.AnchorTable;
        metadata.JoinPath = compileResult.ResolvedJoinPath.ToList();
        metadata.SelectedFields = compileResult.NormalizedFields.ToList();

        var layoutJson = JsonSerializer.Serialize(request.Layout ?? new LayoutDocumentDto(), JsonOptions);
        var queryMetadataJson = JsonSerializer.Serialize(metadata, JsonOptions);
        var compiledSql = compileResult.CompiledSelectQuery;

        using var conn = _connectionFactory.CreateConnection();

        if (request.TemplateId is > 0)
        {
            const string updateSql = @"
                UPDATE dbo.Saved_Report_Templates
                SET
                    TemplateName = @TemplateName,
                    Description = @Description,
                    AnchorTableName = @AnchorTableName,
                    DocumentMode = @DocumentMode,
                    LayoutJson = @LayoutJson,
                    QueryMetadataJson = @QueryMetadataJson,
                    CompiledSelectQuery = @CompiledSelectQuery,
                    UpdatedAt = SYSUTCDATETIME()
                OUTPUT INSERTED.TemplateId, INSERTED.TemplateName, INSERTED.Description, INSERTED.AnchorTableName,
                       INSERTED.DocumentMode, INSERTED.LayoutJson, INSERTED.QueryMetadataJson,
                       INSERTED.CompiledSelectQuery, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.UpdatedAt
                WHERE TemplateId = @TemplateId;
            ";

            var updated = await conn.QueryFirstOrDefaultAsync<SavedReportTemplateDto>(new CommandDefinition(
                updateSql,
                new
                {
                    request.TemplateId,
                    TemplateName = request.TemplateName.Trim(),
                    request.Description,
                    AnchorTableName = compileResult.AnchorTable,
                    DocumentMode = metadata.DocumentMode,
                    LayoutJson = layoutJson,
                    QueryMetadataJson = queryMetadataJson,
                    CompiledSelectQuery = compiledSql
                },
                cancellationToken: cancellationToken));

            if (updated is not null)
            {
                return updated;
            }
        }

        const string insertSql = @"
            INSERT INTO dbo.Saved_Report_Templates
                (TemplateName, Description, AnchorTableName, DocumentMode, LayoutJson, QueryMetadataJson, CompiledSelectQuery, IsActive)
            OUTPUT INSERTED.TemplateId, INSERTED.TemplateName, INSERTED.Description, INSERTED.AnchorTableName,
                   INSERTED.DocumentMode, INSERTED.LayoutJson, INSERTED.QueryMetadataJson,
                   INSERTED.CompiledSelectQuery, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.UpdatedAt
            VALUES
                (@TemplateName, @Description, @AnchorTableName, @DocumentMode, @LayoutJson, @QueryMetadataJson, @CompiledSelectQuery, 1);
        ";

        return await conn.QuerySingleAsync<SavedReportTemplateDto>(new CommandDefinition(
            insertSql,
            new
            {
                TemplateName = request.TemplateName.Trim(),
                request.Description,
                AnchorTableName = compileResult.AnchorTable,
                DocumentMode = metadata.DocumentMode,
                LayoutJson = layoutJson,
                QueryMetadataJson = queryMetadataJson,
                CompiledSelectQuery = compiledSql
            },
            cancellationToken: cancellationToken));
    }

    public async Task<bool> DeleteTemplateAsync(int templateId, CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        var affected = await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.Saved_Report_Templates SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE TemplateId = @TemplateId;",
            new { TemplateId = templateId },
            cancellationToken: cancellationToken));
        return affected > 0;
    }

    public async Task<SavedReportTemplateDto> EnsureDefaultSampleTemplateAsync(CancellationToken cancellationToken = default)
    {
        using var conn = _connectionFactory.CreateConnection();
        var existing = await conn.QueryFirstOrDefaultAsync<SavedReportTemplateDto>(new CommandDefinition(
            "SELECT TOP 1 * FROM dbo.Saved_Report_Templates WHERE IsActive = 1 ORDER BY TemplateId;",
            cancellationToken: cancellationToken));
        if (existing is not null)
        {
            return existing;
        }

        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        var anchorName = snapshot.Tables.ContainsKey("CL_Tripsheet_Header")
            ? "CL_Tripsheet_Header"
            : snapshot.Tables.Keys.First();
        var anchorMeta = snapshot.Tables[anchorName];

        var sampleFields = anchorMeta.Columns
            .Take(5)
            .Select(c => new SelectedFieldDto
            {
                SchemaName = c.SchemaName,
                TableName = c.TableName,
                ColumnName = c.ColumnName,
                TableAlias = c.TableName,
                ColumnSqlAlias = $"{c.TableName}_{c.ColumnName}",
                DisplayName = CatalogService.HumanizeColumnName(c.ColumnName),
                DataType = c.DataType,
                IsRepeaterField = false
            })
            .ToList();

        var firstCol = sampleFields.FirstOrDefault()?.ColumnName ?? "Tripsheet_Id";
        var secondCol = sampleFields.Skip(1).FirstOrDefault()?.ColumnName ?? firstCol;
        var thirdCol = sampleFields.Skip(2).FirstOrDefault()?.ColumnName ?? firstCol;

        var sampleRequest = new SaveReportTemplateRequest
        {
            TemplateName = "TMS Standard Tripsheet & Fleet Dispatch Sheet",
            Description = "Official A4 paginated dispatch & tripsheet template with company header, scalar merge tags, repeating data table, and signature block.",
            AnchorTableName = anchorName,
            DocumentMode = "SingleOrBatchDocument",
            Layout = new LayoutDocumentDto
            {
                PageSetup = new PageSetupDto
                {
                    PageSize = "A4",
                    Orientation = "Portrait",
                    WidthMm = 210,
                    HeightMm = 297,
                    MarginTopMm = 18,
                    MarginBottomMm = 18,
                    MarginLeftMm = 18,
                    MarginRightMm = 18,
                    Columns = 1
                },
                Watermark = new WatermarkDto
                {
                    Enabled = true,
                    Type = "Text",
                    Text = "TMS VERIFIED",
                    RotationDeg = -45,
                    Opacity = 0.08,
                    Color = "#1e3a8a",
                    FontSizePt = 58
                },
                HeaderHtml = "<div style=\"display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1e3a8a;padding-bottom:6px;\"><div><strong style=\"color:#1e3a8a;font-size:14pt;\">TMS LOGISTICS ENTERPRISE</strong><br/><span style=\"font-size:9pt;color:#64748b;\">Automated Dispatch &amp; Tripsheet Advice</span></div><div style=\"text-align:right;font-size:9pt;\">Date: {{SYSTEM.CurrentDate}}<br/>Time: {{SYSTEM.CurrentTime}}</div></div>",
                BodyHtml = $@"<h1 style=""color:#1e3a8a;margin-bottom:8px;"">Tripsheet Dispatch Voucher</h1>
<p>This document certifies the operational dispatch record from <strong>{anchorName}</strong>.</p>
<div class=""word-callout"" style=""border:1px solid #bfdbfe;background:#eff6ff;padding:12px;border-radius:6px;margin:12px 0;"">
  <strong>Primary Dispatch Details:</strong><br/>
  Record Identifier: <span class=""merge-tag"" data-table=""{anchorName}"" data-column=""{firstCol}"" data-alias=""{anchorName}_{firstCol}"">{{{{{anchorName}.{CatalogService.HumanizeColumnName(firstCol)}}}}}</span> &nbsp;|&nbsp;
  Reference: <span class=""merge-tag"" data-table=""{anchorName}"" data-column=""{secondCol}"" data-alias=""{anchorName}_{secondCol}"">{{{{{anchorName}.{CatalogService.HumanizeColumnName(secondCol)}}}}}</span>
</div>
<table style=""width:100%;border-collapse:collapse;margin-top:14px;"" border=""1"">
  <thead>
    <tr data-repeat-header=""true"" style=""background:#1e3a8a;color:#ffffff;"">
      <th style=""padding:8px;border:1px solid #cbd5e1;"">{CatalogService.HumanizeColumnName(firstCol)}</th>
      <th style=""padding:8px;border:1px solid #cbd5e1;"">{CatalogService.HumanizeColumnName(secondCol)}</th>
      <th style=""padding:8px;border:1px solid #cbd5e1;"">{CatalogService.HumanizeColumnName(thirdCol)}</th>
    </tr>
  </thead>
  <tbody>
    <tr data-repeater=""true"" data-repeater-table=""{anchorName}"">
      <td style=""padding:8px;border:1px solid #cbd5e1;""><span class=""merge-tag"" data-table=""{anchorName}"" data-column=""{firstCol}"" data-alias=""{anchorName}_{firstCol}"">{{{{{anchorName}.{CatalogService.HumanizeColumnName(firstCol)}}}}}</span></td>
      <td style=""padding:8px;border:1px solid #cbd5e1;""><span class=""merge-tag"" data-table=""{anchorName}"" data-column=""{secondCol}"" data-alias=""{anchorName}_{secondCol}"">{{{{{anchorName}.{CatalogService.HumanizeColumnName(secondCol)}}}}}</span></td>
      <td style=""padding:8px;border:1px solid #cbd5e1;""><span class=""merge-tag"" data-table=""{anchorName}"" data-column=""{thirdCol}"" data-alias=""{anchorName}_{thirdCol}"">{{{{{anchorName}.{CatalogService.HumanizeColumnName(thirdCol)}}}}}</span></td>
    </tr>
  </tbody>
</table>
<div class=""word-signature-line"" style=""margin-top:36px;display:flex;justify-content:space-between;"">
  <div style=""border-top:1px solid #334155;width:200px;padding-top:4px;font-size:10pt;"">Authorized Fleet Manager</div>
  <div style=""border-top:1px solid #334155;width:200px;padding-top:4px;font-size:10pt;"">Driver Signature &amp; Stamp</div>
</div>",
                FooterHtml = "<div style=\"display:flex;justify-content:space-between;font-size:9pt;color:#64748b;border-top:1px solid #cbd5e1;padding-top:4px;\"><span>Generated by: {{SYSTEM.PrintedBy}}</span><span>Page {{SYSTEM.PageNumber}} of {{SYSTEM.TotalPages}}</span></div>",
                ShowGridlines = true
            },
            QueryMetadata = new QueryMetadataDto
            {
                AnchorTable = anchorName,
                DocumentMode = "SingleOrBatchDocument",
                SelectedFields = sampleFields,
                FilterConfig = new List<RuntimeFilterConfigDto>
                {
                    new()
                    {
                        FilterId = "flt_main",
                        SchemaName = "dbo",
                        TableName = anchorName,
                        ColumnName = firstCol,
                        TableAlias = anchorName,
                        FilterLabel = CatalogService.HumanizeColumnName(firstCol),
                        DataType = sampleFields.First().DataType,
                        Operator = "=",
                        UiControlType = "Dropdown",
                        IsRequired = false
                    }
                }
            }
        };

        return await SaveTemplateAsync(sampleRequest, cancellationToken);
    }
}

