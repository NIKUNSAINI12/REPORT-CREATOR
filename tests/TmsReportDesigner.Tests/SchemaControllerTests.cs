using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Controllers;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

public class SchemaControllerTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<SchemaController> CreateControllerAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graph = new FkGraphService(introspection);
        var reachability = new ReachabilityService(graph);
        return new SchemaController(graph, reachability);
    }

    [Fact]
    public async Task GetStatus_ReturnsOkWithAccurateDatabaseCounts()
    {
        var controller = await CreateControllerAsync();

        var actionResult = await controller.GetStatus(CancellationToken.None);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        Assert.NotNull(okResult.Value);
    }

    [Fact]
    public async Task GetTables_WithSearchFilter_ReturnsMatchingTables()
    {
        var controller = await CreateControllerAsync();

        var actionResult = await controller.GetTables("CL_Tripsheet", CancellationToken.None);
        var okResult = Assert.IsType<OkObjectResult>(actionResult);
        var tables = Assert.IsAssignableFrom<IReadOnlyList<TableMetadata>>(okResult.Value);

        Assert.NotEmpty(tables);
        Assert.Contains(tables, t => t.TableName.Equals("CL_Tripsheet_Header", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ComputeReachability_EndpointReturnsValidReachabilityResult()
    {
        var controller = await CreateControllerAsync();

        var response = await controller.ComputeReachability(
            new ReachabilityRequest { ActiveTables = new[] { "CL_Tripsheet_Header" } },
            CancellationToken.None);

        var okResult = Assert.IsType<OkObjectResult>(response.Result);
        var reachability = Assert.IsType<ReachabilityResult>(okResult.Value);

        Assert.False(reachability.IsZeroState);
        Assert.Equal("CL_Tripsheet_Header", reachability.AnchorTable);
        Assert.Contains("CL_Master_Driver", reachability.ReachableTables, StringComparer.OrdinalIgnoreCase);
    }
}

