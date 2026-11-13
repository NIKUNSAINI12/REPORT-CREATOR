using TmsReportDesigner.Api.Models;

namespace TmsReportDesigner.Api.Services;

public sealed class FkGraphService : IFkGraphService
{
    private readonly ISchemaIntrospectionService _introspectionService;
    private readonly SemaphoreSlim _reloadLock = new(1, 1);
    private SchemaGraphSnapshot? _currentSnapshot;

    public FkGraphService(ISchemaIntrospectionService introspectionService)
    {
        _introspectionService = introspectionService;
    }

    public async Task<SchemaGraphSnapshot> GetSnapshotAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = Volatile.Read(ref _currentSnapshot);
        if (snapshot is not null)
        {
            return snapshot;
        }

        return await ReloadGraphAsync(cancellationToken);
    }

    public async Task<SchemaGraphSnapshot> ReloadGraphAsync(CancellationToken cancellationToken = default)
    {
        await _reloadLock.WaitAsync(cancellationToken);
        try
        {
            var tablesList = await _introspectionService.IntrospectTablesAndColumnsAsync(cancellationToken);
            var physicalManyToOneEdges = await _introspectionService.IntrospectPhysicalForeignKeysAsync(cancellationToken);
            var customRelationships = await _introspectionService.GetActiveCustomRelationshipsAsync(cancellationToken);

            var tableDict = tablesList.ToDictionary(
                t => t.TableName,
                t => t,
                StringComparer.OrdinalIgnoreCase);

            var adjacency = new Dictionary<string, List<FkEdge>>(StringComparer.OrdinalIgnoreCase);
            foreach (var table in tablesList)
            {
                adjacency[table.TableName] = new List<FkEdge>();
            }

            var allEdges = new List<FkEdge>(physicalManyToOneEdges.Count * 2 + customRelationships.Count * 2);

            void AddBidirectionalConstraint(FkEdge manyToOneEdge)
            {
                if (!adjacency.TryGetValue(manyToOneEdge.FromTable, out var fromList))
                {
                    fromList = new List<FkEdge>();
                    adjacency[manyToOneEdge.FromTable] = fromList;
                }
                fromList.Add(manyToOneEdge);
                allEdges.Add(manyToOneEdge);

                // Emit inverse OneToMany (1 -> N) edge from ReferencedTable to ParentTable
                var invertedPairs = manyToOneEdge.ColumnPairs
                    .Select(p => new FkColumnPair(
                        ParentColumn: p.ReferencedColumn,
                        ReferencedColumn: p.ParentColumn,
                        ConstraintColumnId: p.ConstraintColumnId))
                    .ToList();

                var oneToManyEdge = new FkEdge(
                    EdgeId: $"{manyToOneEdge.ConstraintName}:12N",
                    ConstraintName: manyToOneEdge.ConstraintName,
                    FromSchema: manyToOneEdge.ToSchema,
                    FromTable: manyToOneEdge.ToTable,
                    ToSchema: manyToOneEdge.FromSchema,
                    ToTable: manyToOneEdge.FromTable,
                    Cardinality: FkCardinality.OneToMany,
                    ColumnPairs: invertedPairs,
                    RoleLabel: $"{manyToOneEdge.FromTable} ({manyToOneEdge.RoleLabel})",
                    IsComposite: manyToOneEdge.IsComposite,
                    IsSelfReferencing: manyToOneEdge.IsSelfReferencing,
                    IsVirtual: manyToOneEdge.IsVirtual);

                if (!adjacency.TryGetValue(oneToManyEdge.FromTable, out var toList))
                {
                    toList = new List<FkEdge>();
                    adjacency[oneToManyEdge.FromTable] = toList;
                }
                toList.Add(oneToManyEdge);
                allEdges.Add(oneToManyEdge);
            }

            foreach (var physicalEdge in physicalManyToOneEdges)
            {
                AddBidirectionalConstraint(physicalEdge);
            }

            foreach (var custom in customRelationships)
            {
                var role = string.IsNullOrWhiteSpace(custom.RoleLabel)
                    ? SchemaIntrospectionService.DeriveRoleLabel(custom.ParentColumn, custom.ReferencedTable)
                    : custom.RoleLabel!;

                var isSelfRef = string.Equals(custom.ParentTable, custom.ReferencedTable, StringComparison.OrdinalIgnoreCase);

                var virtualManyToOne = new FkEdge(
                    EdgeId: $"{custom.ConstraintName}:N21",
                    ConstraintName: custom.ConstraintName,
                    FromSchema: custom.ParentSchema,
                    FromTable: custom.ParentTable,
                    ToSchema: custom.ReferencedSchema,
                    ToTable: custom.ReferencedTable,
                    Cardinality: FkCardinality.ManyToOne,
                    ColumnPairs: new List<FkColumnPair>
                    {
                        new(custom.ParentColumn, custom.ReferencedColumn, 1)
                    },
                    RoleLabel: role,
                    IsComposite: false,
                    IsSelfReferencing: isSelfRef,
                    IsVirtual: true);

                AddBidirectionalConstraint(virtualManyToOne);
            }

            // Compute multi-FK table pairs (where >1 ManyToOne FK connects the same ParentTable -> ReferencedTable)
            var multiFkPairs = allEdges
                .Where(e => e.Cardinality == FkCardinality.ManyToOne)
                .GroupBy(
                    e => $"{e.FromTable.ToUpperInvariant()}->{e.ToTable.ToUpperInvariant()}",
                    StringComparer.OrdinalIgnoreCase)
                .Where(g => g.Count() > 1)
                .Select(g =>
                {
                    var first = g.First();
                    var edges = g.ToList();
                    return new MultiFkTablePairInfo(first.FromTable, first.ToTable, edges.Count, edges);
                })
                .OrderByDescending(m => m.ForeignKeyCount)
                .ThenBy(m => m.FromTable)
                .ToList();

            var connectedTables = adjacency
                .Count(kvp => kvp.Value.Count > 0 && tableDict.ContainsKey(kvp.Key));
            var unlinkedTables = Math.Max(0, tableDict.Count - connectedTables);

            var readonlyAdjacency = adjacency.ToDictionary(
                kvp => kvp.Key,
                kvp => (IReadOnlyList<FkEdge>)kvp.Value.AsReadOnly(),
                StringComparer.OrdinalIgnoreCase);

            var newSnapshot = new SchemaGraphSnapshot
            {
                Tables = tableDict,
                AdjacencyList = readonlyAdjacency,
                AllEdges = allEdges,
                TotalColumns = tablesList.Sum(t => t.Columns.Count),
                PhysicalForeignKeyCount = physicalManyToOneEdges.Count,
                CustomRelationshipCount = customRelationships.Count,
                ConnectedTableCount = connectedTables,
                UnlinkedTableCount = unlinkedTables,
                CompositeForeignKeyCount = physicalManyToOneEdges.Count(e => e.IsComposite),
                SelfReferencingForeignKeyCount = physicalManyToOneEdges.Count(e => e.IsSelfReferencing),
                MultiFkPairs = multiFkPairs,
                BuiltAtUtc = DateTime.UtcNow
            };

            Interlocked.Exchange(ref _currentSnapshot, newSnapshot);
            return newSnapshot;
        }
        finally
        {
            _reloadLock.Release();
        }
    }

    public async Task<IReadOnlyList<FkEdge>> GetEdgesBetweenAsync(string fromTable, string toTable, CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        if (!snapshot.AdjacencyList.TryGetValue(fromTable, out var edges))
        {
            return Array.Empty<FkEdge>();
        }

        return edges
            .Where(e => string.Equals(e.ToTable, toTable, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    public async Task<IReadOnlyList<MultiFkTablePairInfo>> GetMultiFkTablePairsAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = await GetSnapshotAsync(cancellationToken);
        return snapshot.MultiFkPairs;
    }
}

