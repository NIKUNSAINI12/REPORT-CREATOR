using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public interface IReachabilityService
{
    Task<ReachabilityResult> ComputeReachabilityAsync(
        ReachabilityRequest request,
        CancellationToken cancellationToken = default);
}

