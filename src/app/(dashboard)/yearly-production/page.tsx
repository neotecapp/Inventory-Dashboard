"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import apiClient from "@/lib/apiClient";
import posthog from "posthog-js";

interface YearlyProductionPlan {
  id: number;
  month: string; // 'YYYY-MM-DD'
  data: Record<string, number>; // { "RV1+": 49, "BLAZE X Disc": 808, ... }
  parent_id: number | null;
  parent_bike_name: string | null;
}

interface ParentBike {
  id: number;
  name: string;
}

// ─── BOM Types ───────────────────────────────────────────────────────────────
interface BomParentBikePart {
  part_no: string;
  part_description: string;
  nature: string | null;
  category: string | null;
  supplier: string | null;
  inventory_level: number | null;
  moq: number | null;
  warehouse_qty: number;
  parent_bikes: Record<string, number>; // { "RVX": 6, "RV Blaze X": 4, ... }
}

function fmtN(n: number | null | undefined) {
  return (n || 0).toLocaleString("en-IN");
}

/** Format month column header like "Apr-26", "Jan-27" */
function getMonthColLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const monthShort = d.toLocaleString("en-US", { month: "short" });
  const yearShort = String(d.getFullYear()).slice(-2);
  return `${monthShort}-${yearShort}`;
}

export default function YearlyProductionPage() {
  const [plans, setPlans] = useState<YearlyProductionPlan[]>([]);
  const [parentBikes, setParentBikes] = useState<ParentBike[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [parentFilter, setParentFilter] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BOM state
  const [bomData, setBomData] = useState<BomParentBikePart[]>([]);
  const [bomSearch, setBomSearch] = useState("");
  const [bomCategoryFilter, setBomCategoryFilter] = useState("All");
  const [bomNatureFilter, setBomNatureFilter] = useState("All");
  const [bomStockFilter, setBomStockFilter] = useState("All");
  const [bomVisibleRows, setBomVisibleRows] = useState(100);

  const fetchData = useCallback(async (y: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get(`/yearly-production?year=${y}`);
      if (res.data?.sucess || res.data?.success) {
        const d = res.data.data;
        setPlans(d.plans || []);
        setParentBikes(d.parentBikes || []);
        setAvailableYears(d.availableYears || []);
        setBomData(d.bomParentBikeData || []);
      } else {
        setError("Failed to load yearly production data.");
      }
    } catch {
      setError("Failed to load data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(year);
  }, [fetchData, year]);

  // PostHog tracking
  useEffect(() => {
    const startTime = Date.now();
    posthog.capture("yearly_production_page_viewed");

    return () => {
      const timeSpentSeconds = Math.round((Date.now() - startTime) / 1000);
      posthog.capture("yearly_production_time_spent", {
        time_spent_seconds: timeSpentSeconds,
        time_spent_formatted: `${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s`,
      });
    };
  }, []);

  // Filtered plans based on parent bike selection
  const filteredPlans = useMemo(() => {
    if (parentFilter === "All") return plans;
    return plans.filter((p) => p.parent_bike_name === parentFilter);
  }, [plans, parentFilter]);

  // Sorted months (columns) — deduplicated
  const months = useMemo(() => {
    const uniqueMonths = [...new Set(filteredPlans.map((p) => p.month))];
    return uniqueMonths.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [filteredPlans]);

  // Pivot: rows = models, columns = months
  // Build a map: { modelName: { "2026-04-01": qty, "2026-05-01": qty, ... } }
  const { modelRows, allModels } = useMemo(() => {
    const modelMap = new Map<string, Map<string, number>>();

    filteredPlans.forEach((plan) => {
      Object.entries(plan.data).forEach(([model, qty]) => {
        if (!modelMap.has(model)) {
          modelMap.set(model, new Map());
        }
        const existing = modelMap.get(model)!.get(plan.month) || 0;
        modelMap.get(model)!.set(plan.month, existing + (qty || 0));
      });
    });

    const allModels = [...modelMap.keys()].sort();
    return { modelRows: modelMap, allModels };
  }, [filteredPlans]);

  // Column totals (per month)
  const monthTotals = useMemo(() => {
    const totals = new Map<string, number>();
    months.forEach((m) => {
      let sum = 0;
      allModels.forEach((model) => {
        sum += modelRows.get(model)?.get(m) || 0;
      });
      totals.set(m, sum);
    });
    return totals;
  }, [months, allModels, modelRows]);

  // Row totals (per model)
  const modelTotals = useMemo(() => {
    const totals = new Map<string, number>();
    allModels.forEach((model) => {
      let sum = 0;
      months.forEach((m) => {
        sum += modelRows.get(model)?.get(m) || 0;
      });
      totals.set(model, sum);
    });
    return totals;
  }, [months, allModels, modelRows]);

  // Grand total
  const grandTotal = useMemo(() => {
    let sum = 0;
    modelTotals.forEach((v) => { sum += v; });
    return sum;
  }, [modelTotals]);

  // KPI summaries
  const summary = useMemo(() => {
    const peakMonthEntry = [...monthTotals.entries()].reduce(
      (best, [m, v]) => (v > best[1] ? [m, v] : best),
      ["", 0] as [string, number]
    );
    const peakMonthLabel = peakMonthEntry[0] ? getMonthColLabel(peakMonthEntry[0]) : "—";
    const avgMonthly = months.length > 0 ? Math.round(grandTotal / months.length) : 0;

    return {
      totalUnits: grandTotal,
      totalModels: allModels.length,
      peakMonth: peakMonthEntry[1],
      peakMonthLabel,
      avgMonthly,
    };
  }, [grandTotal, months, allModels, monthTotals]);

  // Export to Excel
  const handleExport = () => {
    if (allModels.length === 0) return;

    const rows = allModels.map((model) => {
      const obj: Record<string, string | number> = { Model: model };
      months.forEach((m) => {
        obj[getMonthColLabel(m)] = modelRows.get(model)?.get(m) || 0;
      });
      obj["Total"] = modelTotals.get(model) || 0;
      return obj;
    });

    // Total row
    const totalRow: Record<string, string | number> = { Model: "Total (Nos.)" };
    months.forEach((m) => {
      totalRow[getMonthColLabel(m)] = monthTotals.get(m) || 0;
    });
    totalRow["Total"] = grandTotal;
    rows.push(totalRow);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Production ${year}`);
    XLSX.writeFile(wb, `Yearly_Production_${year}.xlsx`);

    posthog.capture("yearly_production_exported", { year, format: "xlsx" });
  };

  // ─── BOM Computed Data ───────────────────────────────────────────────────────
  // Get all unique parent bike names from BOM data
  const bomParentBikeNames = useMemo(() => {
    const bikeSet = new Set<string>();
    bomData.forEach((part) => {
      Object.keys(part.parent_bikes).forEach((name) => bikeSet.add(name));
    });
    return [...bikeSet].sort();
  }, [bomData]);

  // Filter months: only show from current month onwards (remove past months)
  const bomMonths = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return months.filter((m) => new Date(m).getTime() >= currentMonthStart);
  }, [months]);

  // Monthly production per parent bike: { parentBikeName: { month: totalQty } }
  // plan.data keys are already resolved to parent bike names by the API (getByYearResolved)
  // So we iterate over data entries and group by the resolved bike name
  const monthlyProductionByParent = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    plans.forEach((plan) => {
      Object.entries(plan.data).forEach(([bikeName, qty]) => {
        if (!result.has(bikeName)) result.set(bikeName, new Map());
        const monthMap = result.get(bikeName)!;
        const existing = monthMap.get(plan.month) || 0;
        monthMap.set(plan.month, existing + (qty || 0));
      });
    });
    return result;
  }, [plans]);

  // Production summary per month (total bikes planned across all parent bikes) — for display
  const monthlyProductionTotals = useMemo(() => {
    const totals = new Map<string, number>();
    bomMonths.forEach((m) => {
      let total = 0;
      monthlyProductionByParent.forEach((monthMap) => {
        total += monthMap.get(m) || 0;
      });
      totals.set(m, total);
    });
    return totals;
  }, [bomMonths, monthlyProductionByParent]);

  // BOM computed rows with monthly consumption and shortage
  const bomComputed = useMemo(() => {
    if (bomData.length === 0) return [];

    return bomData.map((part) => {
      const warehouseQty = part.warehouse_qty;

      // Monthly consumption: for each month (from current onwards), sum (bom_qty_per_parent × production_qty_for_that_parent)
      const monthlyConsumption = new Map<string, number>();
      bomMonths.forEach((m) => {
        let consumption = 0;
        Object.entries(part.parent_bikes).forEach(([parentName, bomQty]) => {
          const productionQty = monthlyProductionByParent.get(parentName)?.get(m) || 0;
          consumption += bomQty * productionQty;
        });
        monthlyConsumption.set(m, consumption);
      });

      // Total requirement (only from current month onwards)
      const totalRequirement = [...monthlyConsumption.values()].reduce((s, v) => s + v, 0);

      // Shortage = Total Requirement - Warehouse Qty (positive means short)
      const shortage = totalRequirement - warehouseQty;

      // Stock status
      let stockStatus: "Out of Stock" | "Low" | "Medium" | "High";
      if (warehouseQty === 0) {
        stockStatus = "Out of Stock";
      } else if (totalRequirement === 0) {
        stockStatus = "High";
      } else if (shortage >= 0) {
        stockStatus = "Out of Stock";
      } else if (warehouseQty < totalRequirement * 0.5) {
        stockStatus = "Low";
      } else if (warehouseQty < totalRequirement * 1.5) {
        stockStatus = "Medium";
      } else {
        stockStatus = "High";
      }

      return {
        ...part,
        monthlyConsumption,
        totalRequirement,
        shortage,
        stockStatus,
      };
    });
  }, [bomData, bomMonths, monthlyProductionByParent]);

  // BOM filters
  const bomCategories = useMemo(() => [...new Set(bomData.map((p) => p.category).filter((c): c is string => c != null))].sort(), [bomData]);
  const bomNatures = useMemo(() => [...new Set(bomData.map((p) => p.nature).filter((n): n is string => n != null))].sort(), [bomData]);

  const filteredBom = useMemo(() => {
    let filtered = bomComputed;
    const q = bomSearch.trim().toLowerCase();
    if (q) filtered = filtered.filter((r) => `${r.part_no} ${r.part_description} ${r.supplier}`.toLowerCase().includes(q));
    if (bomCategoryFilter !== "All") filtered = filtered.filter((r) => r.category === bomCategoryFilter);
    if (bomNatureFilter !== "All") filtered = filtered.filter((r) => r.nature === bomNatureFilter);
    if (bomStockFilter !== "All") filtered = filtered.filter((r) => r.stockStatus === bomStockFilter);
    return filtered;
  }, [bomComputed, bomSearch, bomCategoryFilter, bomNatureFilter, bomStockFilter]);

  // BOM KPI Summary
  const bomSummary = useMemo(() => {
    const totalParts = bomComputed.length;
    const totalRequirement = bomComputed.reduce((s, r) => s + r.totalRequirement, 0);
    const outOfStock = bomComputed.filter((r) => r.stockStatus === "Out of Stock").length;
    const lowStock = bomComputed.filter((r) => r.stockStatus === "Low").length;
    const totalShortage = bomComputed.filter((r) => r.shortage > 0).reduce((s, r) => s + r.shortage, 0);
    const uniqueSuppliers = new Set(bomComputed.map((r) => r.supplier).filter(Boolean)).size;
    return { totalParts, totalRequirement, outOfStock, lowStock, totalShortage, uniqueSuppliers };
  }, [bomComputed]);

  // Export BOM Data
  const exportBomData = useCallback((format: "xlsx" | "csv") => {
    if (filteredBom.length === 0) return;

    const rows = filteredBom.map((r, idx) => {
      const row: Record<string, string | number> = {
        "#": idx + 1,
        "Part No.": r.part_no,
        "Description": r.part_description,
        "Nature": r.nature || "",
        "Category": r.category || "",
        "Supplier": r.supplier || "",
      };

      bomParentBikeNames.forEach((bike) => {
        row[bike] = r.parent_bikes[bike] || 0;
      });

      row["Warehouse Qty"] = r.warehouse_qty;

      bomMonths.forEach((m) => {
        row[getMonthColLabel(m)] = r.monthlyConsumption.get(m) || 0;
      });

      row["Total Req."] = r.totalRequirement;
      row["Shortage"] = r.shortage;
      row["Stock Status"] = r.stockStatus;

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM Part-wise");
    const fileName = `BOM_Yearly_${year}`;

    if (format === "xlsx") {
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      XLSX.writeFile(wb, `${fileName}.csv`, { bookType: "csv" });
    }

    posthog.capture("yearly_bom_exported", { year, format, parts_count: filteredBom.length });
  }, [filteredBom, bomParentBikeNames, bomMonths, year]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="skeleton" style={{ width: 260, height: 28, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 180, height: 14 }} />
          </div>
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 8 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>Yearly Production Plan</h1>
            <p className="page-subtitle">Annual production targets by bike model</p>
          </div>
        </div>
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "var(--error)", fontSize: 14 }}>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => fetchData(year)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Yearly Production Plan</h1>
          <p className="page-subtitle">Annual production targets by bike model — FY {year}–{year + 1}</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={allModels.length === 0}>
            ↓ Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-group">
          <div>
            <div className="filter-label">Year</div>
            <select
              className="input select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 120 }}
            >
              {availableYears.length > 0
                ? availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))
                : <option value={year}>{year}</option>
              }
            </select>
          </div>
          <div>
            <div className="filter-label">Parent Bike</div>
            <select
              className="input select"
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
              style={{ width: 180 }}
            >
              <option value="All">All Parent Bikes</option>
              {parentBikes.map((pb) => (
                <option key={pb.id} value={pb.name}>{pb.name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
            <span className="chip chip-info">
              <span className="chip-dot" />
              {allModels.length} model{allModels.length !== 1 ? "s" : ""} · {months.length} month{months.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 24 }}>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--accent)" } as React.CSSProperties}>
          <div className="kpi-label">Total Planned Units</div>
          <div className="kpi-value">{fmtN(summary.totalUnits)}</div>
          <div className="kpi-sub">FY {year}–{year + 1}</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--success)" } as React.CSSProperties}>
          <div className="kpi-label">Bike Models</div>
          <div className="kpi-value">{summary.totalModels}</div>
          <div className="kpi-sub">unique models planned</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--warning)" } as React.CSSProperties}>
          <div className="kpi-label">Peak Month</div>
          <div className="kpi-value">{fmtN(summary.peakMonth)}</div>
          <div className="kpi-sub">{summary.peakMonthLabel}</div>
        </div>
        <div className="kpi-card" style={{ "--kpi-accent": "var(--purple)" } as React.CSSProperties}>
          <div className="kpi-label">Avg Monthly</div>
          <div className="kpi-value">{fmtN(summary.avgMonthly)}</div>
          <div className="kpi-sub">units per month</div>
        </div>
      </div>

      {/* Data Table — Pivoted: Models as rows, Months as columns */}
      <div className="card">
        <div className="card-header">
          <h3>
            <span className="tag">Production</span>
            Model × Month Breakdown
          </h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                {months.map((m) => (
                  <th key={m} style={{ textAlign: "right" }}>{getMonthColLabel(m)}</th>
                ))}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {allModels.length === 0 ? (
                <tr>
                  <td colSpan={months.length + 2} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                    No production data available for {year}
                  </td>
                </tr>
              ) : (
                <>
                  {allModels.map((model) => {
                    const total = modelTotals.get(model) || 0;
                    return (
                      <tr key={model}>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{model}</td>
                        {months.map((m) => {
                          const val = modelRows.get(model)?.get(m) || 0;
                          return (
                            <td key={m} className="num" style={{ textAlign: "right" }}>
                              {val > 0 ? fmtN(val) : "–"}
                            </td>
                          );
                        })}
                        <td className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                          {fmtN(total)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Footer total row */}
                  <tr style={{ background: "var(--surface-alt)", fontWeight: 700 }}>
                    <td>Total (Nos.)</td>
                    {months.map((m) => (
                      <td key={m} className="num" style={{ textAlign: "right" }}>
                        {fmtN(monthTotals.get(m) || 0)}
                      </td>
                    ))}
                    <td className="num" style={{ textAlign: "right" }}>
                      {fmtN(grandTotal)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── BOM — Part-wise Breakdown Section ─────────────────────────────────── */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-header">
          <h3><span>📋</span> BOM — Part-wise Breakdown</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {filteredBom.length > 0 && (
              <>
                <button onClick={() => exportBomData("xlsx")} className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }}>⬇ Excel</button>
                <button onClick={() => exportBomData("csv")} className="btn btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }}>⬇ CSV</button>
              </>
            )}
            <span className="tag">{fmtN(filteredBom.length)} PARTS</span>
          </div>
        </div>

        {/* BOM KPI Cards */}
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", margin: "20px 24px 0" }}>
          <BomKpiCard label="Total Parts" value={fmtN(bomSummary.totalParts)} sub="In BOM" accent="var(--charcoal)" />
          <BomKpiCard label="Yearly Requirement" value={fmtN(bomSummary.totalRequirement)} sub={`FY ${year}`} accent="var(--accent)" />
          <BomKpiCard label="Out of Stock" value={String(bomSummary.outOfStock)} sub="Need immediate action" accent="var(--error)" />
          <BomKpiCard label="Low Stock" value={String(bomSummary.lowStock)} sub="Below 50% coverage" accent="var(--warning)" />
          <BomKpiCard label="Total Shortage" value={fmtN(bomSummary.totalShortage)} sub="Units short" accent="var(--error)" />
          <BomKpiCard label="Suppliers" value={String(bomSummary.uniqueSuppliers)} sub="Active suppliers" accent="var(--success)" />
        </div>

        {/* BOM Filters */}
        <div className="filter-group">
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <div className="filter-label">Search</div>
            <input className="input" value={bomSearch} onChange={(e) => { setBomSearch(e.target.value); setBomVisibleRows(100); }} placeholder="Part no, description, supplier..." />
          </div>
          <div style={{ minWidth: 160 }}>
            <div className="filter-label">Category</div>
            <select className="input select" value={bomCategoryFilter} onChange={(e) => { setBomCategoryFilter(e.target.value); setBomVisibleRows(100); }}>
              <option value="All">All Categories</option>
              {bomCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div className="filter-label">Nature</div>
            <select className="input select" value={bomNatureFilter} onChange={(e) => { setBomNatureFilter(e.target.value); setBomVisibleRows(100); }}>
              <option value="All">All</option>
              {bomNatures.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <div className="filter-label">Stock Status</div>
            <select className="input select" value={bomStockFilter} onChange={(e) => { setBomStockFilter(e.target.value); setBomVisibleRows(100); }}>
              <option value="All">All</option>
              <option value="Out of Stock">Out of Stock</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          {(bomSearch || bomCategoryFilter !== "All" || bomNatureFilter !== "All" || bomStockFilter !== "All") && (
            <button onClick={() => { setBomSearch(""); setBomCategoryFilter("All"); setBomNatureFilter("All"); setBomStockFilter("All"); setBomVisibleRows(100); }} className="btn btn-ghost" style={{ marginTop: 18 }}>✕ Clear</button>
          )}
        </div>

        {/* BOM Table */}
        <div style={{ overflowX: "auto", maxHeight: 650, overflowY: "auto" }}>
          <table className="data-table" style={{ minWidth: 1200 + bomParentBikeNames.length * 70 + bomMonths.length * 80 }}>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Part No.</th>
                <th style={{ minWidth: 200 }}>Description</th>
                <th>Category</th>
                <th>Supplier</th>
                {bomParentBikeNames.map((bike) => <th key={bike} style={{ textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{bike}</th>)}
                <th style={{ textAlign: "right", borderLeft: "2px solid var(--border)" }}>Warehouse Qty</th>
                {bomMonths.map((m) => <th key={m} style={{ textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{getMonthColLabel(m)}</th>)}
                <th style={{ textAlign: "right", fontWeight: 700 }}>Total Req.</th>
                <th style={{ textAlign: "right", fontWeight: 700 }}>Shortage</th>
                <th style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBom.length === 0 ? (
                <tr><td colSpan={7 + bomParentBikeNames.length + bomMonths.length} style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>No parts match filters.</td></tr>
              ) : filteredBom.slice(0, bomVisibleRows).map((r, idx) => {
                const borderColor = r.stockStatus === "Out of Stock" ? "var(--error)" : r.stockStatus === "Low" ? "var(--warning)" : r.totalRequirement > 0 ? "var(--accent)" : "var(--border)";
                return (
                  <tr key={`${r.part_no}-${idx}`} style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <td className="num" style={{ color: "var(--concrete)", fontSize: 11 }}>{idx + 1}</td>
                    <td className="num" style={{ color: "var(--text-muted)", fontSize: 11 }}>{r.part_no}</td>
                    <td style={{ fontWeight: 500, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.part_description}>{r.part_description}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.category || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.supplier || ""}>{r.supplier || "—"}</td>
                    {bomParentBikeNames.map((bike) => {
                      const val = r.parent_bikes[bike] || 0;
                      return <td key={bike} className="num" style={{ textAlign: "right", color: val > 0 ? "var(--accent)" : "var(--concrete)", fontWeight: val > 0 ? 600 : 400, fontSize: 11 }}>{val > 0 ? val : "—"}</td>;
                    })}
                    <td className="num" style={{ textAlign: "right", fontWeight: 500, borderLeft: "2px solid var(--border-light)", color: r.warehouse_qty > 0 ? "var(--charcoal)" : "var(--error)" }}>{fmtN(r.warehouse_qty)}</td>
                    {bomMonths.map((m) => {
                      const val = r.monthlyConsumption.get(m) || 0;
                      return <td key={m} className="num" style={{ textAlign: "right", fontSize: 11, color: val > 0 ? "var(--charcoal)" : "var(--concrete)" }}>{val > 0 ? fmtN(val) : "—"}</td>;
                    })}
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: r.totalRequirement > 0 ? "var(--accent)" : "var(--concrete)" }}>{r.totalRequirement > 0 ? fmtN(r.totalRequirement) : "—"}</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: r.shortage > 0 ? "var(--error)" : "var(--success)" }}>{r.shortage > 0 ? `-${fmtN(r.shortage)}` : `+${fmtN(Math.abs(r.shortage))}`}</td>
                    <td style={{ textAlign: "center" }}><StockStatusChip status={r.stockStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {filteredBom.length > bomVisibleRows && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Showing {Math.min(bomVisibleRows, filteredBom.length)} of {fmtN(filteredBom.length)}</span>
            <button onClick={() => setBomVisibleRows((v) => v + 100)} className="btn btn-secondary">Load More</button>
          </div>
        )}
        {filteredBom.length > 0 && filteredBom.length <= bomVisibleRows && (
          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtN(filteredBom.length)} parts displayed</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function BomKpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi-card" style={{ "--kpi-accent": accent } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function StockStatusChip({ status }: { status: "Out of Stock" | "Low" | "Medium" | "High" }) {
  if (status === "Out of Stock") return <span className="chip chip-error"><span className="chip-dot" />OUT</span>;
  if (status === "Low") return <span className="chip chip-warning" style={{ background: "rgba(217, 119, 6, 0.1)", color: "#D97706", border: "1px solid rgba(217, 119, 6, 0.3)" }}><span className="chip-dot" style={{ background: "#D97706" }} />LOW</span>;
  if (status === "Medium") return <span className="chip chip-info"><span className="chip-dot" />MED</span>;
  return <span className="chip chip-success"><span className="chip-dot" />HIGH</span>;
}
