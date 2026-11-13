-- =============================================================================
-- TMS Report Designer - Idempotent Database Initialization Script
-- Target Database: TMS_Lite_1_Oct_2026
-- Tables:
--   1. dbo.Report_Field_Catalog (Module 1: Manager Data Dictionary Governance)
--   2. dbo.Report_Custom_Relationships (Module 1 & 2: Virtual FK Bridges for 151 Unlinked Tables)
--   3. dbo.Saved_Report_Templates (Module 2, 3 & 4: Saved Report Layouts & Compiled SQL)
-- =============================================================================

-- 1. Report_Field_Catalog
IF OBJECT_ID('dbo.Report_Field_Catalog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Report_Field_Catalog (
        FieldId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Report_Field_Catalog PRIMARY KEY,
        SchemaName NVARCHAR(128) NOT NULL CONSTRAINT DF_Report_Field_Catalog_SchemaName DEFAULT ('dbo'),
        TableName NVARCHAR(256) NOT NULL,
        ColumnName NVARCHAR(256) NOT NULL,
        DataType NVARCHAR(128) NOT NULL,
        IsNullable BIT NOT NULL CONSTRAINT DF_Report_Field_Catalog_IsNullable DEFAULT (1),
        DisplayName NVARCHAR(256) NOT NULL,
        Category NVARCHAR(256) NOT NULL CONSTRAINT DF_Report_Field_Catalog_Category DEFAULT ('General'),
        IsFilterable BIT NOT NULL CONSTRAINT DF_Report_Field_Catalog_IsFilterable DEFAULT (0),
        IsActive BIT NOT NULL CONSTRAINT DF_Report_Field_Catalog_IsActive DEFAULT (1),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Report_Field_Catalog_UpdatedAt DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Report_Field_Catalog_Schema_Table_Col'
      AND object_id = OBJECT_ID('dbo.Report_Field_Catalog')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_Report_Field_Catalog_Schema_Table_Col
        ON dbo.Report_Field_Catalog (SchemaName, TableName, ColumnName);
END;

-- 2. Report_Custom_Relationships
IF OBJECT_ID('dbo.Report_Custom_Relationships', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Report_Custom_Relationships (
        RelationshipId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Report_Custom_Relationships PRIMARY KEY,
        ConstraintName NVARCHAR(256) NOT NULL CONSTRAINT UQ_Report_Custom_Relationships_ConstraintName UNIQUE,
        ParentSchema NVARCHAR(128) NOT NULL CONSTRAINT DF_Report_Custom_Relationships_ParentSchema DEFAULT ('dbo'),
        ParentTable NVARCHAR(256) NOT NULL,
        ParentColumn NVARCHAR(256) NOT NULL,
        ReferencedSchema NVARCHAR(128) NOT NULL CONSTRAINT DF_Report_Custom_Relationships_ReferencedSchema DEFAULT ('dbo'),
        ReferencedTable NVARCHAR(256) NOT NULL,
        ReferencedColumn NVARCHAR(256) NOT NULL,
        RoleLabel NVARCHAR(256) NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_Report_Custom_Relationships_IsActive DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Report_Custom_Relationships_CreatedAt DEFAULT (SYSUTCDATETIME())
    );
END;

-- 3. Saved_Report_Templates
IF OBJECT_ID('dbo.Saved_Report_Templates', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Saved_Report_Templates (
        TemplateId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Saved_Report_Templates PRIMARY KEY,
        TemplateName NVARCHAR(256) NOT NULL,
        Description NVARCHAR(1000) NULL,
        AnchorTableName NVARCHAR(256) NULL,
        DocumentMode NVARCHAR(64) NOT NULL CONSTRAINT DF_Saved_Report_Templates_DocumentMode DEFAULT ('SingleOrBatchDocument'),
        LayoutJson NVARCHAR(MAX) NOT NULL,
        QueryMetadataJson NVARCHAR(MAX) NOT NULL,
        CompiledSelectQuery NVARCHAR(MAX) NOT NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_Saved_Report_Templates_IsActive DEFAULT (1),
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Saved_Report_Templates_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Saved_Report_Templates_UpdatedAt DEFAULT (SYSUTCDATETIME())
    );
END;

