using Dapper;
using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

[Collection("DatabaseIntegration")]
public class FkGraphServiceTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    [Fact]
    public async Task GetSnapshotAsync_PreservesAllMultiFkPairsCompositeFksAndSelfReferencingFks()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();

        var introspection = new SchemaIntrospectionService(factory);
        var graphService = new FkGraphService(introspection);

        var snapshot = await graphService.GetSnapshotAsync();

        Assert.True(snapshot.Tables.Count >= 404);
        Assert.Equal(341, snapshot.PhysicalForeignKeyCount);
        Assert.Equal(14, snapshot.CompositeForeignKeyCount);
        Assert.Equal(5, snapshot.SelfReferencingForeignKeyCount);
        Assert.True(snapshot.MultiFkPairs.Count >= 14);

        // Verify CL_Thc_Header -> CL_Master_Location has all 4 distinct ManyToOne physical edges
        var thcToLocEdges = (await graphService.GetEdgesBetweenAsync("CL_Thc_Header", "CL_Master_Location"))
            .Where(e => e.Cardinality == FkCardinality.ManyToOne && !e.IsVirtual)
            .ToList();
        Assert.Equal(4, thcToLocEdges.Count);
        Assert.Equal(4, thcToLocEdges.Select(e => e.ConstraintName).Distinct(StringComparer.OrdinalIgnoreCase).Count());

        // Verify CL_Tripsheet_Header -> CL_Master_Driver has 2 distinct ManyToOne physical edges
        var tripToDriverEdges = (await graphService.GetEdgesBetweenAsync("CL_Tripsheet_Header", "CL_Master_Driver"))
            .Where(e => e.Cardinality == FkCardinality.ManyToOne && !e.IsVirtual)
            .ToList();
        Assert.Equal(2, tripToDriverEdges.Count);
    }

    [Fact]
    public async Task ReloadGraphAsync_MergesCustomVirtualRelationshipsImmediately()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();

        var introspection = new SchemaIntrospectionService(factory);
        var graphService = new FkGraphService(introspection);

        const string tempConstraint = "VK_Test_Virtual_Bridge_Phase01";
        using var conn = factory.CreateConnection();

        try
        {
            await conn.ExecuteAsync(
                "DELETE FROM dbo.Report_Custom_Relationships WHERE ConstraintName = @ConstraintName;",
                new { ConstraintName = tempConstraint });

            await conn.ExecuteAsync(@"
                INSERT INTO dbo.Report_Custom_Relationships
                    (ConstraintName, ParentSchema, ParentTable, ParentColumn, ReferencedSchema, ReferencedTable, ReferencedColumn, RoleLabel, IsActive)
                VALUES
                    (@ConstraintName, 'dbo', 'Report_Field_Catalog', 'TableName', 'dbo', 'Saved_Report_Templates', 'AnchorTableName', 'Virtual Catalog Bridge Test', 1);
            ", new { ConstraintName = tempConstraint });

            var snapshot = await graphService.ReloadGraphAsync();
            Assert.True(snapshot.CustomRelationshipCount >= 1);

            var edges = await graphService.GetEdgesBetweenAsync("Report_Field_Catalog", "Saved_Report_Templates");
            Assert.Contains(edges, e => e.ConstraintName == tempConstraint && e.IsVirtual && e.RoleLabel == "Virtual Catalog Bridge Test");
        }
        finally
        {
            await conn.ExecuteAsync(
                "DELETE FROM dbo.Report_Custom_Relationships WHERE ConstraintName = @ConstraintName;",
                new { ConstraintName = tempConstraint });
        }
    }
}
