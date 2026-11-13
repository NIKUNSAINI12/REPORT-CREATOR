using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Controllers;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

[Collection("DatabaseIntegration")]
public class ManagerControllerTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<ManagerController> CreateControllerAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graph = new FkGraphService(introspection);
        var catalog = new CatalogService(factory, graph);
        return new ManagerController(catalog);
    }

    [Fact]
    public async Task GetTableSummaries_ReturnsAllTablesAndUnlinkedFilter()
    {
        var controller = await CreateControllerAsync();

        var allResult = Assert.IsType<OkObjectResult>(await controller.GetTableSummaries(null, "all", CancellationToken.None));
        var allTables = Assert.IsAssignableFrom<IReadOnlyList<CatalogTableSummaryDto>>(allResult.Value);
        Assert.True(allTables.Count >= 404);

        var unlinkedResult = Assert.IsType<OkObjectResult>(await controller.GetTableSummaries(null, "unlinked", CancellationToken.None));
        var unlinkedTables = Assert.IsAssignableFrom<IReadOnlyList<CatalogTableSummaryDto>>(unlinkedResult.Value);
        Assert.True(unlinkedTables.Count >= 150);
    }

    [Fact]
    public async Task SeedDefaultCatalog_AndGetPublishedFields_ReturnsActiveGovernedFields()
    {
        var controller = await CreateControllerAsync();

        var seedResult = Assert.IsType<OkObjectResult>(await controller.SeedDefaultCatalog(CancellationToken.None));
        Assert.NotNull(seedResult.Value);

        var pubResult = Assert.IsType<OkObjectResult>(await controller.GetPublishedFields(CancellationToken.None));
        var published = Assert.IsAssignableFrom<IReadOnlyList<CatalogColumnDto>>(pubResult.Value);
        Assert.NotEmpty(published);
    }
}

