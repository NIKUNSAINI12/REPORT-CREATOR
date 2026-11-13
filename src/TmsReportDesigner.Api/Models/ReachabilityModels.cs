using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Models;

public sealed class ReachabilityRequest
{
    public IReadOnlyList<string> ActiveTables { get; init; } = Array.Empty<string>();
    public IReadOnlyDictionary<string, string>? SelectedRoleConstraints { get; init; }
}

public sealed record RoleOptionDto(
    string ConstraintName,
    string RoleLabel,
    string FromTable,
    string ToTable,
    IReadOnlyList<FkColumnPair> ColumnPairs,
    string SuggestedAlias
);

public sealed record JoinStepDto(
    string FromTable,
    string FromAlias,
    string ToTable,
    string ToAlias,
    string ConstraintName,
    string RoleLabel,
    FkCardinality Cardinality,
    IReadOnlyList<FkColumnPair> ColumnPairs,
    string JoinPredicateSql
);

public sealed record TableReachabilityInfo(
    string TableName,
    bool IsReachable,
    int HopDistance,
    string? LockReason,
    bool RequiresRoleDisambiguation,
    IReadOnlyList<RoleOptionDto> AvailableRoles,
    IReadOnlyList<FkEdge> ShortestPathEdges
);

public sealed class ReachabilityResult
{
    public required bool IsZeroState { get; init; }
    public string? AnchorTable { get; init; }
    public required IReadOnlyList<string> ReachableTables { get; init; }
    public required IReadOnlyList<string> LockedTables { get; init; }
    public required IReadOnlyDictionary<string, TableReachabilityInfo> TableDetails { get; init; }
    public required IReadOnlyList<JoinStepDto> ResolvedJoinPath { get; init; }
}

