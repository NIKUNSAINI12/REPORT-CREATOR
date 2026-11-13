using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

[Collection("DatabaseIntegration")]
public class SqlCompilerAndTemplateTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<(ISqlCompilerService Compiler, ITemplateService Templates)> CreateServicesAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graph = new FkGraphService(introspection);
        var reachability = new ReachabilityService(graph);
        var compiler = new SqlCompilerService(graph, reachability);
        var templates = new TemplateService(factory, compiler, graph);
        return (compiler, templates);
    }

    [Fact]
    public async Task CompileSelectQueryAsync_GeneratesBracketQuotedLeftJoinSqlWithRoleDisambiguation()
    {
        var (compiler, _) = await CreateServicesAsync();
        var snapshot = await new FkGraphService(new SchemaIntrospectionService(new SqlConnectionFactory(TestConnectionString))).GetSnapshotAsync();

        var thcCol = snapshot.Tables["CL_Thc_Header"].Columns.First().ColumnName;
        var locCol = snapshot.Tables["CL_Master_Location"].Columns.First().ColumnName;

        var result = await compiler.CompileSelectQueryAsync(new QueryMetadataDto
        {
            AnchorTable = "CL_Thc_Header",
            SelectedFields = new List<SelectedFieldDto>
            {
                new()
                {
                    TableName = "CL_Thc_Header",
                    ColumnName = thcCol,
                    DisplayName = "THC Number"
                },
                new()
                {
                    TableName = "CL_Master_Location",
                    ColumnName = locCol,
                    DisplayName = "Origin Location"
                }
            }
        });

        Assert.Equal("CL_Thc_Header", result.AnchorTable);
        Assert.Contains("FROM [dbo].[CL_Thc_Header] AS [CL_Thc_Header]", result.CompiledSelectQuery);
        Assert.Contains("LEFT JOIN [dbo].[CL_Master_Location] AS [CL_Master_Location__", result.CompiledSelectQuery);
        Assert.Contains("WHERE 1=1 /*DYNAMIC_FILTERS*/", result.CompiledSelectQuery);
    }

    [Fact]
    public async Task SaveAndRetrieveTemplate_PersistsLayoutMetadataAndCompiledSelectQuery()
    {
        var (_, templates) = await CreateServicesAsync();
        var seeded = await templates.EnsureDefaultSampleTemplateAsync();

        Assert.True(seeded.TemplateId > 0);
        Assert.NotEmpty(seeded.LayoutJson);
        Assert.NotEmpty(seeded.QueryMetadataJson);
        Assert.Contains("SELECT", seeded.CompiledSelectQuery);

        var loaded = await templates.GetTemplateByIdAsync(seeded.TemplateId);
        Assert.NotNull(loaded);
        Assert.Equal(seeded.TemplateName, loaded!.TemplateName);
    }
}

