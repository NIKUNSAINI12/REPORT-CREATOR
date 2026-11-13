using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface ISqlCompilerService
{
    Task<SqlCompileResultDto> CompileSelectQueryAsync(
        QueryMetadataDto metadata,
        CancellationToken cancellationToken = default);
}

