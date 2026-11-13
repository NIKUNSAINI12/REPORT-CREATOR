using Microsoft.AspNetCore.Mvc;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Api.Controllers;

[ApiController]
[Route("api/templates")]
public sealed class TemplatesController : ControllerBase
{
    private readonly ITemplateService _templateService;
    private readonly ISqlCompilerService _sqlCompilerService;

    public TemplatesController(ITemplateService templateService, ISqlCompilerService sqlCompilerService)
    {
        _templateService = templateService;
        _sqlCompilerService = sqlCompilerService;
    }

    [HttpGet]
    public async Task<IActionResult> GetTemplates(CancellationToken cancellationToken)
    {
        var templates = await _templateService.GetTemplatesAsync(cancellationToken);
        return Ok(templates);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTemplateById(int id, CancellationToken cancellationToken)
    {
        var template = await _templateService.GetTemplateByIdAsync(id, cancellationToken);
        if (template is null)
        {
            return NotFound(new { error = $"Template #{id} not found." });
        }
        return Ok(template);
    }

    [HttpPost("compile-preview")]
    public async Task<IActionResult> CompilePreview(
        [FromBody] QueryMetadataDto metadata,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _sqlCompilerService.CompileSelectQueryAsync(metadata ?? new QueryMetadataDto(), cancellationToken);
            return Ok(result);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> SaveTemplate(
        [FromBody] SaveReportTemplateRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var saved = await _templateService.SaveTemplateAsync(request, cancellationToken);
            return Ok(saved);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateTemplate(
        int id,
        [FromBody] SaveReportTemplateRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            request.TemplateId = id;
            var saved = await _templateService.SaveTemplateAsync(request, cancellationToken);
            return Ok(saved);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteTemplate(int id, CancellationToken cancellationToken)
    {
        var deleted = await _templateService.DeleteTemplateAsync(id, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { error = $"Template #{id} not found." });
        }
        return Ok(new { deleted = true, templateId = id });
    }
}

