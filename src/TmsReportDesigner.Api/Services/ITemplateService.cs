using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface ITemplateService
{
    Task<IReadOnlyList<SavedReportTemplateDto>> GetTemplatesAsync(CancellationToken cancellationToken = default);
    Task<SavedReportTemplateDto?> GetTemplateByIdAsync(int templateId, CancellationToken cancellationToken = default);
    Task<SavedReportTemplateDto> SaveTemplateAsync(SaveReportTemplateRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeleteTemplateAsync(int templateId, CancellationToken cancellationToken = default);
    Task<SavedReportTemplateDto> EnsureDefaultSampleTemplateAsync(CancellationToken cancellationToken = default);
}

