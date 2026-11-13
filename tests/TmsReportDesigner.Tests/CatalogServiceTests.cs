using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

[Collection("DatabaseIntegration")]
public class CatalogServiceTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<(ICatalogService Catalog, IFkGraphService Graph)> CreateServicesAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graph = new FkGraphService(introspection);
        var catalog = new CatalogService(factory, graph);
        return (catalog, graph);
    }

    [Fact]
    public void HumanizeColumnName_FormatsAliasesAndPreservesAcronyms()
    {
        Assert.Equal("Consignment Number", CatalogService.HumanizeColumnName("Consignment_No"));
        Assert.Equal("LR ID", CatalogService.HumanizeColumnName("LR_Id"));
        Assert.Equal("THC Date", CatalogService.HumanizeColumnName("Thc_Dt"));
        Assert.Equal("Total Freight Amount", CatalogService.HumanizeColumnName("Total_Freight_Amt"));
    }

    [Fact]
    public async Task BulkGovernAndUpsertFields_PersistsToReportFieldCatalogAndExposesPublishedFields()
    {
        var (catalog, _) = await CreateServicesAsync();

        var updated = await catalog.BulkGovernTableAsync(
            "CL_Master_Location",
            new BulkTableGovernanceRequest
            {
                PublishAll = true,
                AutoHumanizeAliases = true,
                CategoryOverride = "Master Data",
                MarkKeyAndDateColumnsFilterable = true
            });

        Assert.True(updated > 0);

        var published = await catalog.GetColumnsAsync(tableName: "CL_Master_Location", publishedOnly: true);
        Assert.Equal(updated, published.Count);
        Assert.All(published, c => Assert.True(c.IsActive));
    }

    [Fact]
    public async Task CreateAndDeleteCustomRelationship_UpdatesFkGraphInRealTime()
    {
        var (catalog, graph) = await CreateServicesAsync();

        var created = await catalog.CreateCustomRelationshipAsync(new CreateCustomRelationshipRequest
        {
            ParentSchema = "dbo",
            ParentTable = "Saved_Report_Templates",
            ParentColumn = "AnchorTableName",
            ReferencedSchema = "dbo",
            ReferencedTable = "Report_Field_Catalog",
            ReferencedColumn = "TableName",
            RoleLabel = "Template Anchor Bridge"
        });

        try
        {
            Assert.True(created.RelationshipId > 0);

            var edges = await graph.GetEdgesBetweenAsync("Saved_Report_Templates", "Report_Field_Catalog");
            Assert.Contains(edges, e => e.IsVirtual && e.RoleLabel == "Template Anchor Bridge");
        }
        finally
        {
            var deleted = await catalog.DeleteCustomRelationshipAsync(created.RelationshipId);
            Assert.True(deleted);
        }
    }
}
