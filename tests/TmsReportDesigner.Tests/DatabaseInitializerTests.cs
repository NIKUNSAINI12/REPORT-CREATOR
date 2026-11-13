using Dapper;
using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;

namespace TmsReportDesigner.Tests;

public class DatabaseInitializerTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    [Fact]
    public async Task InitializeAsync_CreatesAllThreeReportTablesIdempotently()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);

        // Execute twice to verify idempotency
        await initializer.InitializeAsync();
        await initializer.InitializeAsync();

        using var conn = factory.CreateConnection();

        var existingTables = (await conn.QueryAsync<string>(@"
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = 'dbo'
              AND TABLE_NAME IN ('Report_Field_Catalog', 'Report_Custom_Relationships', 'Saved_Report_Templates')
        ")).ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.Contains("Report_Field_Catalog", existingTables);
        Assert.Contains("Report_Custom_Relationships", existingTables);
        Assert.Contains("Saved_Report_Templates", existingTables);

        var catalogColumns = (await conn.QueryAsync<string>(@"
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Report_Field_Catalog'
        ")).ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.Contains("FieldId", catalogColumns);
        Assert.Contains("TableName", catalogColumns);
        Assert.Contains("ColumnName", catalogColumns);
        Assert.Contains("DisplayName", catalogColumns);
        Assert.Contains("Category", catalogColumns);
        Assert.Contains("IsFilterable", catalogColumns);
        Assert.Contains("IsActive", catalogColumns);

        var templateColumns = (await conn.QueryAsync<string>(@"
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Saved_Report_Templates'
        ")).ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.Contains("TemplateId", templateColumns);
        Assert.Contains("LayoutJson", templateColumns);
        Assert.Contains("QueryMetadataJson", templateColumns);
        Assert.Contains("CompiledSelectQuery", templateColumns);
        Assert.Contains("DocumentMode", templateColumns);
    }
}

