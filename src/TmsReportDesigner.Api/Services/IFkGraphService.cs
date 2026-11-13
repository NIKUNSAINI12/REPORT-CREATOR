using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface IFkGraphService
{
    Task<SchemaGraphSnapshot> GetSnapshotAsync(CancellationToken cancellationToken = default);
    Task<SchemaGraphSnapshot> ReloadGraphAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FkEdge>> GetEdgesBetweenAsync(string fromTable, string toTable, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MultiFkTablePairInfo>> GetMultiFkTablePairsAsync(CancellationToken cancellationToken = default);
}

