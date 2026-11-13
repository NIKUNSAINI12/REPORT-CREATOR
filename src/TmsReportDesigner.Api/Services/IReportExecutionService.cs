using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface IReportExecutionService
{
    Task<IReadOnlyList<string>> GetFilterLookupValuesAsync(
        string tableName,
        string columnName,
        string? search = null,
        CancellationToken cancellationToken = default);

    Task<ReportExecutionResponseDto> ExecuteReportAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default);

    Task<byte[]> ExportDocxAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default);

    Task<byte[]> ExportPdfAsync(
        int templateId,
        ExecuteReportRequest request,
        CancellationToken cancellationToken = default);
}

