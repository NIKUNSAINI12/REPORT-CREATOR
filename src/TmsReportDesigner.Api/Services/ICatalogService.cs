using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface ICatalogService
{
    Task<IReadOnlyList<CatalogTableSummaryDto>> GetTableSummariesAsync(
        string? search = null,
        string? filterMode = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CatalogColumnDto>> GetColumnsAsync(
        string? tableName = null,
        string? search = null,
        bool? publishedOnly = null,
        string? category = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CatalogColumnDto>> GetPublishedFieldsAsync(
        CancellationToken cancellationToken = default);

    Task<int> UpsertFieldsAsync(
        IEnumerable<UpsertCatalogFieldRequest> requests,
        CancellationToken cancellationToken = default);

    Task<int> BulkGovernTableAsync(
        string tableName,
        BulkTableGovernanceRequest request,
        CancellationToken cancellationToken = default);

    Task<int> SeedDefaultTmsCatalogAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CustomRelationshipRecord>> GetCustomRelationshipsAsync(
        CancellationToken cancellationToken = default);

    Task<CustomRelationshipRecord> CreateCustomRelationshipAsync(
        CreateCustomRelationshipRequest request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteCustomRelationshipAsync(
        int relationshipId,
        CancellationToken cancellationToken = default);
}

