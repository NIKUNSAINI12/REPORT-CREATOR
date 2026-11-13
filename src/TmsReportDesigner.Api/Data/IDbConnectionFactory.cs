using System.Data;

namespace TmsReportDesigner.Api.Data;

public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
    string GetConnectionString();
}

