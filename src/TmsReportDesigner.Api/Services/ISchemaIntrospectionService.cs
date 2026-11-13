using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface ISchemaIntrospectionService
{
    Task<IReadOnlyList<TableMetadata>> IntrospectTablesAndColumnsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FkEdge>> IntrospectPhysicalForeignKeysAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CustomRelationshipRecord>> GetActiveCustomRelationshipsAsync(CancellationToken cancellationToken = default);
}

