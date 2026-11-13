---
phase: 02
slug: module-1-manager-data-dictionary-virtual-relationship-portal
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-13
---

# Phase 02 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | xUnit 2.9.2 (`.NET 8`) + Angular CLI Build (`ng build`) |
| **Config file** | `tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj` |
| **Quick run command** | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~CatalogServiceTests"` |
| **Full suite command** | `dotnet test TmsReportDesigner.sln` |
| **Estimated runtime** | ~4 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MGR-01, MGR-02, MGR-03, MGR-04, MGR-05 | T-02-01 | Validate table/column against SchemaGraphSnapshot whitelist before upsert or custom FK creation | integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~CatalogServiceTests"` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | MGR-01, MGR-02, MGR-03, MGR-04, MGR-05 | T-02-02 | Parameterized Dapper upsert and immediate ReloadGraphAsync() | integration | `dotnet test tests/TmsReportDesigner.Tests/TmsReportDesigner.Tests.csproj --filter "FullyQualifiedName~ManagerControllerTests"` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 2 | MGR-01, MGR-02, MGR-03, MGR-04, MGR-05 | - | Angular CDK virtual scroll + Manager Portal UI | build | `npm --prefix client run build` | ✅ | ⬜ pending |

