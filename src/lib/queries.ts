/**
 * SQL Queries
 * ===========
 * Centralized query definitions for inventory and procurement modules.
 *
 * Database Schema Reference (MySQL 8.4 – inventory_dashboard):
 * ─────────────────────────────────────────────────────────────
 * bike            : id, bike_code, bike_name, bike_type(FG|SFG), parent_id → parent_bikes
 * bike_colors     : id, color_name, color_code
 * bike_model_colors: id, bike_model_id → bike_models, bike_color_id → bike_colors
 * bike_models     : id, model_name, description, is_active
 * category        : id, name, updated_by
 * departments     : id, department_name, description
 * module_permissions: id, department_id, role_id, module_id, can_view/create/edit/delete
 * modules         : id, module_name, description
 * monthly_production_plan: id, bike_model_id → bike, month(date), data(json)
 * nature          : id, name, updated_by
 * parent_bikes    : id, name
 * part            : id, nature_id, category_id, part_no, part_description, supplier_id, inventory_level, moq
 * roles           : id, role_name, description
 * supplier        : id, name
 * users           : id, employee_id, name, email, password_hash, role_id, department_id, is_active, last_login
 * yearly_bike_production: id, month(date), data(json), parent_id → parent_bikes
 */

// ─── Warehouse Wise Inventory (MSSQL / SAP B1) ──────────────────────────────

export const WAREHOUSE_WISE_INVENTORY = `
SELECT
    T0.ItemCode,
    T0.ItemName AS [Description],
    T1.ItmsGrpNam AS [Item Group],
    T2.WhsCode AS [Warehouse Code],
    T3.WhsName AS [Warehouse Name],
    CAST(T2.OnHand AS DECIMAL(19,2)) AS [Warehouse Qty],
    CAST(T2.IsCommited AS DECIMAL(19,2)) AS [Committed Qty],
    CAST(T2.OnOrder AS DECIMAL(19,2)) AS [On Order Qty],
    CAST(T2.OnHand - T2.IsCommited + T2.OnOrder AS DECIMAL(19,2)) AS [Available Qty]
FROM OITW T2 WITH (NOLOCK)
INNER JOIN OITM T0 WITH (NOLOCK) ON T0.ItemCode = T2.ItemCode
INNER JOIN OITB T1 WITH (NOLOCK) ON T1.ItmsGrpCod = T0.ItmsGrpCod
INNER JOIN OWHS T3 WITH (NOLOCK) ON T3.WhsCode = T2.WhsCode
WHERE T2.OnHand <> 0
  AND T1.ItmsGrpNam = 'Raw Material'
  AND T3.WhsCode IN ('RM','Accept','QC')
ORDER BY T0.ItemCode, T2.WhsCode
`;

// ─── BOM Pivot – All RV Bikes (MSSQL / SAP B1) ──────────────────────────────

export const BOM_PIVOT_RV_BIKES = `
DECLARE @Columns NVARCHAR(MAX);
DECLARE @SelectColumns NVARCHAR(MAX);
DECLARE @SQL NVARCHAR(MAX);

SELECT @Columns = STUFF((
    SELECT ',' + QUOTENAME(Name)
    FROM (SELECT DISTINCT Name FROM OITT WHERE Name LIKE '%RV%') B
    ORDER BY Name
    FOR XML PATH(''), TYPE
).value('.', 'NVARCHAR(MAX)'), 1, 1, '');

SELECT @SelectColumns = STUFF((
    SELECT ',ISNULL(' + QUOTENAME(Name) + ',0) AS ' + QUOTENAME(Name)
    FROM (SELECT DISTINCT Name FROM OITT WHERE Name LIKE '%RV%') B
    ORDER BY Name
    FOR XML PATH(''), TYPE
).value('.', 'NVARCHAR(MAX)'), 1, 1, '');

SET @SQL = '
SELECT
    [Part No],
    [Part Description],' + @SelectColumns + '
FROM (
    SELECT
        T0.Name AS BikeName,
        T1.Code AS [Part No],
        T2.ItemName AS [Part Description],
        T1.Quantity AS [BOM Qty]
    FROM OITT T0
    INNER JOIN ITT1 T1 ON T1.Father = T0.Code
    INNER JOIN OITM T2 ON T2.ItemCode = T1.Code
    WHERE T0.Name LIKE ''%RV%''
) AS SourceData
PIVOT (
    SUM([BOM Qty])
    FOR BikeName IN (' + @Columns + ')
) AS PivotTable
ORDER BY [Part No], [Part Description];';

EXEC sp_executesql @SQL;
`;

// ─── Full BOM Details – All FG Bikes (MSSQL / SAP B1) ───────────────────────

export const FULL_BOM_ALL_BIKES = `
;WITH All_FG_Bikes AS (
    SELECT
        T0.Code AS FGCode,
        T0.Name AS FGName,
        T1.Code AS SFGCode
    FROM OITT T0 WITH (NOLOCK)
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T0.Code NOT LIKE '%_SFG'
      AND T1.Code LIKE '%_SFG'
      AND T0.TreeType = 'P'
),
SFG_Parts AS (
    SELECT
        FG.FGCode,
        FG.FGName,
        T1.Code AS ComponentCode,
        T1.ItemName AS ComponentDescription,
        T1.Quantity AS ComponentQty,
        T1.IssueMthd AS IssueMethod,
        'Semi-Finished BOM' AS Source
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.SFGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
),
FG_Parts AS (
    SELECT
        FG.FGCode,
        FG.FGName,
        T1.Code AS ComponentCode,
        T1.ItemName AS ComponentDescription,
        T1.Quantity AS ComponentQty,
        T1.IssueMthd AS IssueMethod,
        'Finished BOM' AS Source
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.FGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T1.Code NOT LIKE '%_SFG'
),
Combined AS (
    SELECT * FROM SFG_Parts
    UNION ALL
    SELECT * FROM FG_Parts
)
SELECT
    FGCode AS [FG Code],
    FGName AS [FG Description],
    ComponentCode AS [Component Code],
    ComponentDescription AS [Component Description],
    SUM(ComponentQty) AS [BOM Qty],
    MAX(IssueMethod) AS [Issue Method],
    CASE
        WHEN COUNT(*) > 1 THEN 'Both'
        ELSE MAX(Source)
    END AS [Source]
FROM Combined
GROUP BY FGCode, FGName, ComponentCode, ComponentDescription
ORDER BY ComponentCode, FGCode
`;

// ─── Production Plan – Daily Breakdown (MySQL / inventory_dashboard) ─────────
// Now handled by productionPlanRepository.ts using the monthly_production_plan
// table with JSON `data` column. The old query is no longer needed.

// ─── Yearly Bike Production (MySQL / inventory_dashboard) ────────────────────
// Handled by yearlyProductionRepository.ts using the yearly_bike_production
// table joined with parent_bikes for bike names.

export const YEARLY_BIKE_PRODUCTION_BY_YEAR = `
SELECT
  ybp.id,
  ybp.month,
  ybp.data,
  ybp.parent_id,
  pb.name AS parent_bike_name
FROM yearly_bike_production ybp
LEFT JOIN parent_bikes pb ON ybp.parent_id = pb.id
WHERE YEAR(ybp.month) = ?
ORDER BY ybp.month ASC
`;

export const YEARLY_BIKE_PRODUCTION_ALL = `
SELECT
  ybp.id,
  ybp.month,
  ybp.data,
  ybp.parent_id,
  pb.name AS parent_bike_name
FROM yearly_bike_production ybp
LEFT JOIN parent_bikes pb ON ybp.parent_id = pb.id
ORDER BY ybp.month DESC
`;

export const PARENT_BIKES_ALL = `
SELECT id, name FROM parent_bikes ORDER BY name
`;
