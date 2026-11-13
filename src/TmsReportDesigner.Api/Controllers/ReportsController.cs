using Microsoft.AspNetCore.Mvc;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Api.Controllers;

[ApiController]
[Route("api/reports")]
public sealed class ReportsController : ControllerBase
{
    private readonly IReportExecutionService _executionService;

    public ReportsController(IReportExecutionService executionService)
    {
        _executionService = executionService;
    }

    [HttpGet("filter-lookup")]
    public async Task<IActionResult> GetFilterLookupValues(
        [FromQuery] string tableName,
        [FromQuery] string columnName,
        [FromQuery] string? search = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var values = await _executionService.GetFilterLookupValuesAsync(tableName, columnName, search, cancellationToken);
            return Ok(values);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{templateId:int}/execute")]
    public async Task<IActionResult> ExecuteReport(
        int templateId,
        [FromBody] ExecuteReportRequest? request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var req = request ?? new ExecuteReportRequest();

            // Merge any URL query parameters into QueryParamOverrides for direct URL link execution
            foreach (var qp in Request.Query)
            {
                if (!req.QueryParamOverrides.ContainsKey(qp.Key) && !string.IsNullOrWhiteSpace(qp.Value))
                {
                    req.QueryParamOverrides[qp.Key] = qp.Value.ToString();
                }
            }

            var response = await _executionService.ExecuteReportAsync(templateId, req, cancellationToken);
            return Ok(response);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{templateId:int}/export/docx")]
    public async Task<IActionResult> ExportDocx(
        int templateId,
        [FromBody] ExecuteReportRequest? request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var bytes = await _executionService.ExportDocxAsync(templateId, request ?? new ExecuteReportRequest(), cancellationToken);
            var fileName = $"TMS_Report_{templateId}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.docx";
            return File(
                bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                fileName);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{templateId:int}/export/pdf")]
    public async Task<IActionResult> ExportPdf(
        int templateId,
        [FromBody] ExecuteReportRequest? request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var bytes = await _executionService.ExportPdfAsync(templateId, request ?? new ExecuteReportRequest(), cancellationToken);
            var fileName = $"TMS_Report_{templateId}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.pdf";
            return File(bytes, "application/pdf", fileName);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

