using Dapper;
using TmsReportDesigner.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularDev", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddSingleton<DatabaseInitializer>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAngularDev");

// Initialize idempotent report designer tables on startup
using (var scope = app.Services.CreateScope())
{
    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();
    await initializer.InitializeAsync();
}

app.MapGet("/api/health", async (IDbConnectionFactory connectionFactory) =>
{
    using var conn = connectionFactory.CreateConnection();
    var dbName = await conn.ExecuteScalarAsync<string>("SELECT DB_NAME();");
    return Results.Ok(new
    {
        status = "Healthy",
        database = dbName ?? "TMS_Lite_1_Oct_2026",
        timestamp = DateTime.UtcNow
    });
});

app.MapControllers();

app.Run();

public partial class Program { }

