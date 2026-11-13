---
phase: "01"
slug: "database-foundation-schema-introspection-fk-multigraph-engine"
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-13"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit (`dotnet test` on .NET 8.0) |
| **Config file** | `tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj` |
| **Quick run command** | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --no-restore` |
| **Full suite command** | `dotnet test TmsReportDesigner.sln` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj`
- **After every plan wave:** Run `dotnet test TmsReportDesigner.sln`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SCHEMA-01 | T-01-01 | Connection string read from configuration; DDL idempotent | integration | `dotnet build TmsReportDesigner.sln` | ✅ W1 | ⬜ pending |
| 01-01-02 | 01 | 1 | SCHEMA-01 | T-01-02 | DDL creates Report_Field_Catalog, Report_Custom_Relationships, Saved_Report_Templates | integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~DatabaseInitializerTests"` | ✅ W1 | ⬜ pending |
| 01-02-01 | 02 | 2 | SCHEMA-02 | T-01-03 | Read-only metadata introspection queries against INFORMATION_SCHEMA and sys catalogs | integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~SchemaIntrospectionTests"` | ✅ W2 | ⬜ pending |
| 01-02-02 | 02 | 2 | SCHEMA-03 | T-01-04 | Labeled multigraph preserves composite FKs, self-FKs, multi-FK pairs, and virtual FKs | unit+integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~FkGraphServiceTests"` | ✅ W2 | ⬜ pending |
| 01-03-01 | 03 | 3 | SCHEMA-04 | T-01-05 | Cardinality-aware BFS blocks N->1<-N chasm traps and resolves shortest LEFT JOIN paths | unit+integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~ReachabilityServiceTests"` | ✅ W3 | ⬜ pending |
| 01-03-02 | 03 | 3 | SCHEMA-04 | T-01-06 | Schema & Reachability API endpoints validate table names against catalog whitelist | integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~SchemaControllerTests"` | ✅ W3 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing `.NET SDK` (`dotnet`) and `Node.js` (`npm`) cover all test runner requirements; `01-01-PLAN.md` Task 1 scaffolds `tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj`.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-13

