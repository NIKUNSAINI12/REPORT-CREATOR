using Microsoft.AspNetCore.Mvc;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Api.Controllers;

[ApiController]
[Route("api/schema")]
public sealed class SchemaController : ControllerBase
{
    private readonly IFkGraphService _fkGraphService;
    private readonly IReachabilityService _reachabilityService;

    public SchemaController(IFkGraphService fkGraphService, IReachabilityService reachabilityService)
    {
        _fkGraphService = fkGraphService;
        _reachabilityService = reachabilityService;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus(CancellationToken cancellationToken)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        return Ok(new
        {
            totalTables = snapshot.Tables.Count,
            totalColumns = snapshot.TotalColumns,
            physicalForeignKeys = snapshot.PhysicalForeignKeyCount,
            customRelationships = snapshot.CustomRelationshipCount,
            connectedTables = snapshot.ConnectedTableCount,
            unlinkedTables = snapshot.UnlinkedTableCount,
            compositeForeignKeys = snapshot.CompositeForeignKeyCount,
            multiFkPairs = snapshot.MultiFkPairs.Count,
            selfReferencingForeignKeys = snapshot.SelfReferencingForeignKeyCount,
            builtAtUtc = snapshot.BuiltAtUtc
        });
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables([FromQuery] string? search = null, CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        var tables = snapshot.Tables.Values.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            tables = tables.Where(t =>
                t.TableName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                t.Columns.Any(c => c.ColumnName.Contains(term, StringComparison.OrdinalIgnoreCase)));
        }

        return Ok(tables.OrderBy(t => t.TableName, StringComparer.OrdinalIgnoreCase).ToList());
    }

    [HttpGet("graph")]
    public async Task<IActionResult> GetGraph(CancellationToken cancellationToken)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);
        return Ok(new
        {
            totalTables = snapshot.Tables.Count,
            physicalForeignKeys = snapshot.PhysicalForeignKeyCount,
            customRelationships = snapshot.CustomRelationshipCount,
            multiFkPairs = snapshot.MultiFkPairs,
            edges = snapshot.AllEdges
        });
    }

    [HttpPost("reachability")]
    public async Task<ActionResult<ReachabilityResult>> ComputeReachability(
        [FromBody] ReachabilityRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _reachabilityService.ComputeReachabilityAsync(request ?? new ReachabilityRequest(), cancellationToken);
        return Ok(result);
    }

    [HttpPost("reload")]
    public async Task<IActionResult> ReloadGraph(CancellationToken cancellationToken)
    {
        var snapshot = await _fkGraphService.ReloadGraphAsync(cancellationToken);
        return Ok(new
        {
            status = "Reloaded",
            totalTables = snapshot.Tables.Count,
            physicalForeignKeys = snapshot.PhysicalForeignKeyCount,
            customRelationships = snapshot.CustomRelationshipCount,
            builtAtUtc = snapshot.BuiltAtUtc
        });
    }
}

