using System.Text.RegularExpressions;
using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class ReachabilityService : IReachabilityService
{
    public const string DefaultLockReason = "Cannot add: No Foreign Key relationship with selected tables";

    private readonly IFkGraphService _fkGraphService;

    private sealed record BfsNodeState(
        string TableName,
        bool HasTraversedManyToOne,
        int HopDistance,
        IReadOnlyList<FkEdge> PathEdges
    );

    public ReachabilityService(IFkGraphService fkGraphService)
    {
        _fkGraphService = fkGraphService;
    }

    public async Task<ReachabilityResult> ComputeReachabilityAsync(
        ReachabilityRequest request,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await _fkGraphService.GetSnapshotAsync(cancellationToken);

        // Filter ActiveTables against known catalog whitelist (T-01-06 mitigation)
        var validActiveTables = (request.ActiveTables ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t) && snapshot.Tables.ContainsKey(t))
            .Select(t => snapshot.Tables[t].TableName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Zero-State: no active tables on the canvas -> all tables unlocked and reachable
        if (validActiveTables.Count == 0)
        {
            var allTableNames = snapshot.Tables.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase).ToList();
            var zeroDetails = allTableNames.ToDictionary(
                t => t,
                t => new TableReachabilityInfo(
                    TableName: t,
                    IsReachable: true,
                    HopDistance: 0,
                    LockReason: null,
                    RequiresRoleDisambiguation: false,
                    AvailableRoles: Array.Empty<RoleOptionDto>(),
                    ShortestPathEdges: Array.Empty<FkEdge>()),
                StringComparer.OrdinalIgnoreCase);

            return new ReachabilityResult
            {
                IsZeroState = true,
                AnchorTable = null,
                ReachableTables = allTableNames,
                LockedTables = Array.Empty<string>(),
                TableDetails = zeroDetails,
                ResolvedJoinPath = Array.Empty<JoinStepDto>()
            };
        }

        var anchorTable = validActiveTables[0];

        // Cardinality-Aware BFS (D-06):
        // Seed BFS from the Anchor Table (HopDistance = 0) so every other table in validActiveTables
        // and across the schema gets its true shortest path and role disambiguation metadata from AnchorTable.
        var visitedStates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var bestPathByTable = new Dictionary<string, BfsNodeState>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<BfsNodeState>();

        var anchorState = new BfsNodeState(
            TableName: anchorTable,
            HasTraversedManyToOne: false,
            HopDistance: 0,
            PathEdges: Array.Empty<FkEdge>());

        visitedStates.Add($"{anchorTable.ToUpperInvariant()}|False");
        bestPathByTable[anchorTable] = anchorState;
        queue.Enqueue(anchorState);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();

            if (!snapshot.AdjacencyList.TryGetValue(current.TableName, out var outgoingEdges))
            {
                continue;
            }

            foreach (var edge in outgoingEdges)
            {
                // Avoid infinite self-join loops unless self-referencing hop is direct from an active table
                if (edge.IsSelfReferencing && current.HopDistance > 0)
                {
                    continue;
                }

                // Chasm/Fan-Trap Rule (D-06):
                // Once we have traversed a ManyToOne (N -> 1) edge to a parent/master lookup table,
                // we CANNOT traverse a OneToMany (1 -> N) edge back down into an unrelated transaction table.
                if (current.HasTraversedManyToOne && edge.Cardinality == FkCardinality.OneToMany)
                {
                    continue;
                }

                var nextHasTraversedManyToOne = current.HasTraversedManyToOne || edge.Cardinality == FkCardinality.ManyToOne;
                var nextStateKey = $"{edge.ToTable.ToUpperInvariant()}|{nextHasTraversedManyToOne}";

                if (visitedStates.Contains(nextStateKey))
                {
                    continue;
                }

                visitedStates.Add(nextStateKey);

                var nextPath = new List<FkEdge>(current.PathEdges.Count + 1);
                nextPath.AddRange(current.PathEdges);
                nextPath.Add(edge);

                var nextNode = new BfsNodeState(
                    TableName: edge.ToTable,
                    HasTraversedManyToOne: nextHasTraversedManyToOne,
                    HopDistance: current.HopDistance + 1,
                    PathEdges: nextPath);

                if (!bestPathByTable.TryGetValue(edge.ToTable, out var existingBest) ||
                    nextNode.HopDistance < existingBest.HopDistance)
                {
                    bestPathByTable[edge.ToTable] = nextNode;
                }

                queue.Enqueue(nextNode);
            }
        }

        var reachableTables = new List<string>();
        var lockedTables = new List<string>();
        var tableDetails = new Dictionary<string, TableReachabilityInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (var tableName in snapshot.Tables.Keys.OrderBy(k => k, StringComparer.OrdinalIgnoreCase))
        {
            if (bestPathByTable.TryGetValue(tableName, out var bfsState))
            {
                reachableTables.Add(tableName);

                var availableRoles = new List<RoleOptionDto>();
                var requiresDisambiguation = false;

                if (bfsState.PathEdges.Count > 0)
                {
                    var lastEdge = bfsState.PathEdges[^1];
                    if (snapshot.AdjacencyList.TryGetValue(lastEdge.FromTable, out var siblings))
                    {
                        var parallelEdges = siblings
                            .Where(e =>
                                string.Equals(e.ToTable, lastEdge.ToTable, StringComparison.OrdinalIgnoreCase) &&
                                e.Cardinality == lastEdge.Cardinality)
                            .ToList();

                        if (parallelEdges.Count > 1)
                        {
                            requiresDisambiguation = true;
                            foreach (var pe in parallelEdges)
                            {
                                var firstCol = pe.ColumnPairs.FirstOrDefault()?.ParentColumn ?? pe.ConstraintName;
                                var suggestedAlias = BuildSuggestedAlias(pe.ToTable, firstCol);
                                availableRoles.Add(new RoleOptionDto(
                                    ConstraintName: pe.ConstraintName,
                                    RoleLabel: pe.RoleLabel,
                                    FromTable: pe.FromTable,
                                    ToTable: pe.ToTable,
                                    ColumnPairs: pe.ColumnPairs,
                                    SuggestedAlias: suggestedAlias));
                            }
                        }
                    }
                }

                tableDetails[tableName] = new TableReachabilityInfo(
                    TableName: tableName,
                    IsReachable: true,
                    HopDistance: bfsState.HopDistance,
                    LockReason: null,
                    RequiresRoleDisambiguation: requiresDisambiguation,
                    AvailableRoles: availableRoles,
                    ShortestPathEdges: bfsState.PathEdges);
            }
            else
            {
                lockedTables.Add(tableName);
                tableDetails[tableName] = new TableReachabilityInfo(
                    TableName: tableName,
                    IsReachable: false,
                    HopDistance: -1,
                    LockReason: DefaultLockReason,
                    RequiresRoleDisambiguation: false,
                    AvailableRoles: Array.Empty<RoleOptionDto>(),
                    ShortestPathEdges: Array.Empty<FkEdge>());
            }
        }

        // Build ordered LEFT JOIN path across all active tables starting from anchorTable
        var resolvedJoinSteps = BuildOrderedJoinPath(
            anchorTable,
            validActiveTables,
            bestPathByTable,
            snapshot,
            request.SelectedRoleConstraints);

        return new ReachabilityResult
        {
            IsZeroState = false,
            AnchorTable = anchorTable,
            ReachableTables = reachableTables,
            LockedTables = lockedTables,
            TableDetails = tableDetails,
            ResolvedJoinPath = resolvedJoinSteps
        };
    }

    private static IReadOnlyList<JoinStepDto> BuildOrderedJoinPath(
        string anchorTable,
        IReadOnlyList<string> activeTables,
        IReadOnlyDictionary<string, BfsNodeState> bestPathByTable,
        SchemaGraphSnapshot snapshot,
        IReadOnlyDictionary<string, string>? selectedRoleConstraints)
    {
        var steps = new List<JoinStepDto>();
        var addedEdgeKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var targetTable in activeTables.Skip(1))
        {
            if (!bestPathByTable.TryGetValue(targetTable, out var state))
            {
                continue;
            }

            var currentFromAlias = anchorTable;
            foreach (var rawEdge in state.PathEdges)
            {
                var chosenEdge = rawEdge;

                // Check if user selected a specific FK constraint for this (FromTable -> ToTable) pair
                var pairKey = $"{rawEdge.FromTable}->{rawEdge.ToTable}";
                if (selectedRoleConstraints is not null &&
                    (selectedRoleConstraints.TryGetValue(pairKey, out var preferredConstraint) ||
                     selectedRoleConstraints.TryGetValue(rawEdge.ToTable, out preferredConstraint)) &&
                    snapshot.AdjacencyList.TryGetValue(rawEdge.FromTable, out var candidates))
                {
                    var match = candidates.FirstOrDefault(e =>
                        string.Equals(e.ConstraintName, preferredConstraint, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(e.ToTable, rawEdge.ToTable, StringComparison.OrdinalIgnoreCase));
                    if (match is not null)
                    {
                        chosenEdge = match;
                    }
                }

                // Determine if parallel FKs exist between FromTable and ToTable
                var hasParallelEdges = snapshot.AdjacencyList.TryGetValue(chosenEdge.FromTable, out var allFromEdges) &&
                    allFromEdges.Count(e =>
                        string.Equals(e.ToTable, chosenEdge.ToTable, StringComparison.OrdinalIgnoreCase) &&
                        e.Cardinality == chosenEdge.Cardinality) > 1;

                var toAlias = hasParallelEdges || chosenEdge.IsSelfReferencing
                    ? BuildSuggestedAlias(chosenEdge.ToTable, chosenEdge.ColumnPairs.FirstOrDefault()?.ParentColumn ?? chosenEdge.ConstraintName)
                    : chosenEdge.ToTable;

                var stepKey = $"{currentFromAlias}->{toAlias}:{chosenEdge.ConstraintName}";
                if (!addedEdgeKeys.Add(stepKey))
                {
                    currentFromAlias = toAlias;
                    continue;
                }

                var predicateParts = chosenEdge.ColumnPairs
                    .Select(cp => $"[{currentFromAlias}].[{cp.ParentColumn}] = [{toAlias}].[{cp.ReferencedColumn}]");
                var predicateSql = string.Join(" AND ", predicateParts);

                steps.Add(new JoinStepDto(
                    FromTable: chosenEdge.FromTable,
                    FromAlias: currentFromAlias,
                    ToTable: chosenEdge.ToTable,
                    ToAlias: toAlias,
                    ConstraintName: chosenEdge.ConstraintName,
                    RoleLabel: chosenEdge.RoleLabel,
                    Cardinality: chosenEdge.Cardinality,
                    ColumnPairs: chosenEdge.ColumnPairs,
                    JoinPredicateSql: predicateSql));

                currentFromAlias = toAlias;
            }
        }

        return steps;
    }

    public static string BuildSuggestedAlias(string tableName, string columnOrRole)
    {
        var cleanSuffix = Regex.Replace(columnOrRole, @"[^a-zA-Z0-9_]", "_");
        return $"{tableName}__{cleanSuffix}";
    }
}
