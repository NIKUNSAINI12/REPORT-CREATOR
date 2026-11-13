using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

public class SchemaIntrospectionTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    [Fact]
    public async Task IntrospectTablesAndColumns_ReturnsAllBaseTablesAndColumnsFromTmsDatabase()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var service = new SchemaIntrospectionService(factory);

        var tables = await service.IntrospectTablesAndColumnsAsync();

        // TMS_Lite_1_Oct_2026 has 404 original base tables (+3 report designer tables = 407)
        Assert.True(tables.Count >= 404, $"Expected at least 404 base tables, got {tables.Count}");

        var totalColumns = tables.Sum(t => t.Columns.Count);
        Assert.True(totalColumns >= 5925, $"Expected at least 5,925 base table columns, got {totalColumns}");

        var thcHeader = tables.FirstOrDefault(t => string.Equals(t.TableName, "CL_Thc_Header", StringComparison.OrdinalIgnoreCase));
        Assert.NotNull(thcHeader);
        Assert.NotEmpty(thcHeader.Columns);
        Assert.True(thcHeader.HasPhysicalForeignKeys);
    }

    [Fact]
    public async Task IntrospectPhysicalForeignKeys_ReturnsAll341PhysicalConstraintsIncludingCompositeAndSelfRef()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var service = new SchemaIntrospectionService(factory);

        var edges = await service.IntrospectPhysicalForeignKeysAsync();

        Assert.Equal(341, edges.Count);

        var compositeCount = edges.Count(e => e.IsComposite && e.ColumnPairs.Count > 1);
        Assert.Equal(14, compositeCount);

        var selfRefCount = edges.Count(e => e.IsSelfReferencing);
        Assert.Equal(5, selfRefCount);
    }
}
