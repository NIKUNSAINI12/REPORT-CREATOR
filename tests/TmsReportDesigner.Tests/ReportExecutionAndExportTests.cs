using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.Extensions.Logging.Abstractions;
using TmsReportDesigner.Api.Data;
using TmsReportDesigner.Api.Models;
using TmsReportDesigner.Api.Services;

namespace TmsReportDesigner.Tests;

[Collection("DatabaseIntegration")]
public class ReportExecutionAndExportTests
{
    private const string TestConnectionString =
        "Server=localhost;Database=TMS_Lite_1_Oct_2026;User Id=sa;Password=123456;TrustServerCertificate=True;";

    private static async Task<(IReportExecutionService Execution, ITemplateService Templates)> CreateServicesAsync()
    {
        var factory = new SqlConnectionFactory(TestConnectionString);
        var initializer = new DatabaseInitializer(factory, NullLogger<DatabaseInitializer>.Instance);
        await initializer.InitializeAsync();
        var introspection = new SchemaIntrospectionService(factory);
        var graph = new FkGraphService(introspection);
        var reachability = new ReachabilityService(graph);
        var compiler = new SqlCompilerService(graph, reachability);
        var templates = new TemplateService(factory, compiler, graph);
        var execution = new ReportExecutionService(factory, templates, graph, compiler);
        return (execution, templates);
    }

    [Fact]
    public void FormatFieldValue_FormatsIndianCurrencyDatesTextCaseAndNullDefaults()
    {
        Assert.Equal("₹ 12,500.50", ReportExecutionService.FormatFieldValue(12500.5m, "₹ #,##0.00", null, null));
        Assert.Equal("15-10-2026", ReportExecutionService.FormatFieldValue(new DateTime(2026, 10, 15), "DD-MM-YYYY", null, null));
        Assert.Equal("CONSIGNMENT", ReportExecutionService.FormatFieldValue("consignment", null, "UPPERCASE", null));
        Assert.Equal("N/A", ReportExecutionService.FormatFieldValue(null, null, null, "N/A"));
    }

    [Fact]
    public async Task ExecuteReport_AndExportDocxAndPdf_GeneratesValidMergedOutputs()
    {
        var (execution, templates) = await CreateServicesAsync();
        var sample = await templates.EnsureDefaultSampleTemplateAsync();

        var execResult = await execution.ExecuteReportAsync(sample.TemplateId, new ExecuteReportRequest
        {
            MaxRows = 25,
            PrintedBy = "Automated xUnit Verifier"
        });

        Assert.Equal(sample.TemplateId, execResult.TemplateId);
        Assert.NotEmpty(execResult.Documents);
        Assert.Contains("Automated xUnit Verifier", execResult.CombinedPreviewHtml);

        // Verify Word (.docx) export opens cleanly in OpenXML SDK and contains PageSize / PageMargin geometry
        var docxBytes = await execution.ExportDocxAsync(sample.TemplateId, new ExecuteReportRequest
        {
            MaxRows = 10,
            PrintedBy = "Automated xUnit Verifier"
        });

        Assert.True(docxBytes.Length > 1000);
        using (var ms = new MemoryStream(docxBytes))
        using (var wordDoc = WordprocessingDocument.Open(ms, false))
        {
            Assert.NotNull(wordDoc.MainDocumentPart);
            var body = wordDoc.MainDocumentPart!.Document.Body;
            Assert.NotNull(body);
            var sectPr = body!.Elements<SectionProperties>().FirstOrDefault();
            Assert.NotNull(sectPr);
            Assert.NotNull(sectPr!.GetFirstChild<PageSize>());
            Assert.NotNull(sectPr.GetFirstChild<PageMargin>());
        }

        // Verify PDF export starts with %PDF- header
        var pdfBytes = await execution.ExportPdfAsync(sample.TemplateId, new ExecuteReportRequest
        {
            MaxRows = 10,
            PrintedBy = "Automated xUnit Verifier"
        });

        Assert.True(pdfBytes.Length > 200);
        var pdfHeader = System.Text.Encoding.ASCII.GetString(pdfBytes, 0, 5);
        Assert.Equal("%PDF-", pdfHeader);
    }
}

