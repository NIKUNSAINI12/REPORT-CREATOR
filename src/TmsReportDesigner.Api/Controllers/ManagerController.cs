using Microsoft.AspNetCore.Mvc;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Api.Controllers;

[ApiController]
[Route("api/manager")]
public sealed class ManagerController : ControllerBase
{
    private readonly ICatalogService _catalogService;

    public ManagerController(ICatalogService catalogService)
    {
        _catalogService = catalogService;
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTableSummaries(
        [FromQuery] string? search = null,
        [FromQuery] string? filterMode = null,
        CancellationToken cancellationToken = default)
    {
        var tables = await _catalogService.GetTableSummariesAsync(search, filterMode, cancellationToken);
        return Ok(tables);
    }

    [HttpGet("columns")]
    public async Task<IActionResult> GetColumns(
        [FromQuery] string? tableName = null,
        [FromQuery] string? search = null,
        [FromQuery] bool? publishedOnly = null,
        [FromQuery] string? category = null,
        CancellationToken cancellationToken = default)
    {
        var columns = await _catalogService.GetColumnsAsync(tableName, search, publishedOnly, category, cancellationToken);
        return Ok(columns);
    }

    [HttpGet("published-fields")]
    public async Task<IActionResult> GetPublishedFields(CancellationToken cancellationToken = default)
    {
        var fields = await _catalogService.GetPublishedFieldsAsync(cancellationToken);
        return Ok(fields);
    }

    [HttpPut("fields")]
    public async Task<IActionResult> UpsertFields(
        [FromBody] List<UpsertCatalogFieldRequest> requests,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var count = await _catalogService.UpsertFieldsAsync(requests ?? new List<UpsertCatalogFieldRequest>(), cancellationToken);
            return Ok(new { updatedCount = count });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("tables/{tableName}/bulk-publish")]
    public async Task<IActionResult> BulkGovernTable(
        string tableName,
        [FromBody] BulkTableGovernanceRequest? request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var count = await _catalogService.BulkGovernTableAsync(
                tableName,
                request ?? new BulkTableGovernanceRequest(),
                cancellationToken);
            return Ok(new { tableName, updatedCount = count });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("seed-defaults")]
    public async Task<IActionResult> SeedDefaultCatalog(CancellationToken cancellationToken = default)
    {
        var count = await _catalogService.SeedDefaultTmsCatalogAsync(cancellationToken);
        return Ok(new { seededCount = count });
    }

    [HttpGet("custom-relationships")]
    public async Task<IActionResult> GetCustomRelationships(CancellationToken cancellationToken = default)
    {
        var relationships = await _catalogService.GetCustomRelationshipsAsync(cancellationToken);
        return Ok(relationships);
    }

    [HttpPost("custom-relationships")]
    public async Task<IActionResult> CreateCustomRelationship(
        [FromBody] CreateCustomRelationshipRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var created = await _catalogService.CreateCustomRelationshipAsync(request, cancellationToken);
            return Ok(created);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("custom-relationships/{id:int}")]
    public async Task<IActionResult> DeleteCustomRelationship(int id, CancellationToken cancellationToken = default)
    {
        var deleted = await _catalogService.DeleteCustomRelationshipAsync(id, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { error = $"Custom relationship {id} not found." });
        }
        return Ok(new { deleted = true, relationshipId = id });
    }
}

