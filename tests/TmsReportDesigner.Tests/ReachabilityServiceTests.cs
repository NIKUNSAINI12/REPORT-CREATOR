using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

public class ReachabilityServiceTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<IReachabilityService> CreateReachabilityServiceAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graphService = new FkGraphService(introspection);
        return new ReachabilityService(graphService);
    }

    [Fact]
    public async Task ComputeReachabilityAsync_ZeroState_UnlocksAllTables()
    {
        var service = await CreateReachabilityServiceAsync();

        var result = await service.ComputeReachabilityAsync(new ReachabilityRequest
        {
            ActiveTables = Array.Empty<string>()
        });

        Assert.True(result.IsZeroState);
        Assert.Null(result.AnchorTable);
        Assert.True(result.ReachableTables.Count >= 404);
        Assert.Empty(result.LockedTables);
    }

    [Fact]
    public async Task ComputeReachabilityAsync_AnchorState_SurfacesMultiFkRolesAndLocksUnlinkedTables()
    {
        var service = await CreateReachabilityServiceAsync();

        var result = await service.ComputeReachabilityAsync(new ReachabilityRequest
        {
            ActiveTables = new[] { "CL_Thc_Header", "CL_Master_Location" }
        });

        Assert.False(result.IsZeroState);
        Assert.Equal("CL_Thc_Header", result.AnchorTable);

        // CL_Master_Location must be reachable at 1 hop with RequiresRoleDisambiguation = true and 4 AvailableRoles
        Assert.True(result.TableDetails.TryGetValue("CL_Master_Location", out var locInfo));
        Assert.NotNull(locInfo);
        Assert.True(locInfo.IsReachable);
        Assert.Equal(1, locInfo.HopDistance);
        Assert.True(locInfo.RequiresRoleDisambiguation);
        Assert.Equal(4, locInfo.AvailableRoles.Count);

        // Unlinked tables must be locked with exact LockReason
        Assert.NotEmpty(result.LockedTables);
        var sampleLocked = result.LockedTables[0];
        Assert.Equal(
            "Cannot add: No Foreign Key relationship with selected tables",
            result.TableDetails[sampleLocked].LockReason);

        // ResolvedJoinPath must contain the aliased join step between CL_Thc_Header and CL_Master_Location
        Assert.NotEmpty(result.ResolvedJoinPath);
        Assert.Contains(result.ResolvedJoinPath, step =>
            step.FromTable.Equals("CL_Thc_Header", StringComparison.OrdinalIgnoreCase) &&
            step.ToTable.Equals("CL_Master_Location", StringComparison.OrdinalIgnoreCase) &&
            step.ToAlias.StartsWith("CL_Master_Location__", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ComputeReachabilityAsync_BlocksChasmTrapThroughSharedMasterLookupTables()
    {
        var service = await CreateReachabilityServiceAsync();

        // Both CL_Thc_Header and CL_Tripsheet_Header reference CL_Master_Location (N -> 1).
        // Selecting CL_Thc_Header as the Anchor Table MUST reach CL_Master_Location (N -> 1),
        // but MUST NOT traverse N -> 1 <- N backwards from CL_Master_Location into unrelated CL_Tripsheet_Header!
        var result = await service.ComputeReachabilityAsync(new ReachabilityRequest
        {
            ActiveTables = new[] { "CL_Thc_Header" }
        });

        Assert.True(result.TableDetails["CL_Master_Location"].IsReachable);
        Assert.False(
            result.TableDetails["CL_Tripsheet_Header"].IsReachable,
            "Chasm trap N -> 1 <- N through CL_Master_Location must be blocked!");
        Assert.Equal(
            "Cannot add: No Foreign Key relationship with selected tables",
            result.TableDetails["CL_Tripsheet_Header"].LockReason);
    }
}
