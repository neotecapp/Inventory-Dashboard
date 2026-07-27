"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import apiClient from "@/lib/apiClient";

interface BikeModel {
  id: number;
  model_name: string;
}

interface PlanRow {
  id: number;
  bike_model_id: number;
  bike_model: string;
  month: string;
  data: Record<string, number>;
}

type AllModelsData = Record<number, Record<string, number>>;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function EditProductionPlanPage() {
  const searchParams = useSearchParams();
  const initialMonth = searchParams.get("month") || getCurrentMonth();

  const [month, setMonth] = useState(initialMonth);
  const [models, setModels] = useState<BikeModel[]>([]);
  const [existingPlans, setExistingPlans] = useState<PlanRow[]>([]);
  const [allData, setAllData] = useState<AllModelsData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const daysInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }, [month]);

  const dayKeys = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth]
  );

  const getDayName = useCallback(
    (day: number) => {
      const [y, m] = month.split("-").map(Number);
      const date = new Date(y, m - 1, day);
      return date.toLocaleDateString("en-IN", { weekday: "short" });
    },
    [month]
  );

  const isSunday = useCallback(
    (day: number) => {
      const [y, m] = month.split("-").map(Number);
      const date = new Date(y, m - 1, day);
      return date.getDay() === 0;
    },
    [month]
  );

  const fetchData = useCallback(async (m: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get(`/production-plan?month=${m}`);
      if (res.data?.success) {
        const fetchedModels: BikeModel[] = res.data.data.models || [];
        const fetchedPlans: PlanRow[] = res.data.data.plans || [];
        setModels(fetchedModels);
        setExistingPlans(fetchedPlans);

        const days = (() => {
          const [y, mo] = m.split("-").map(Number);
          return new Date(y, mo, 0).getDate();
        })();

        const initial: AllModelsData = {};
        fetchedModels.forEach((model) => {
          const existing = fetchedPlans.find((p) => p.bike_model_id === model.id);
          if (existing) {
            initial[model.id] = { ...existing.data };
          } else {
            const empty: Record<string, number> = {};
            for (let d = 1; d <= days; d++) empty[String(d)] = 0;
            initial[model.id] = empty;
          }
        });
        setAllData(initial);
      } else {
        setError("Failed to load data.");
      }
    } catch {
      setError("Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(month);
  }, [fetchData, month]);

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    setSuccess(null);
    setError(null);
  };

  const handleDayChange = (modelId: number, day: string, value: string) => {
    const num = value === "" ? 0 : parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setAllData((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], [day]: num },
    }));
  };

  const getModelTotal = (modelId: number) => {
    const data = allData[modelId];
    if (!data) return 0;
    return Object.values(data).reduce((s, v) => s + (v || 0), 0);
  };

  const grandTotal = useMemo(() => {
    return models.reduce((sum, m) => sum + getModelTotal(m.id), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, allData]);

  const handleSave = async () => {
    const modelsWithData = models.filter((m) => getModelTotal(m.id) > 0);
    if (modelsWithData.length === 0) {
      setError("Please enter quantity for at least one bike model.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let created = 0;
      let updated = 0;

      for (const model of modelsWithData) {
        const existing = existingPlans.find((p) => p.bike_model_id === model.id);
        if (existing) {
          await apiClient.put("/production-plan", {
            id: existing.id,
            data: allData[model.id],
          });
          updated++;
        } else {
          await apiClient.post("/production-plan", {
            month,
            bike_model_id: model.id,
            data: allData[model.id],
          });
          created++;
        }
      }

      const parts = [];
      if (created > 0) parts.push(`${created} plan(s) created`);
      if (updated > 0) parts.push(`${updated} plan(s) updated`);
      setSuccess(parts.join(", ") + " successfully.");

      await fetchData(month);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setError(axiosErr.response?.data?.message || "Failed to save plans.");
      } else {
        setError("Failed to save plans.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [month]);

  const fmtN = (n: number) => n.toLocaleString("en-IN");

  return (
    <div>
      {/* Header — always visible so month picker remains accessible */}
      <div className="page-header">
        <div>
          <h1>Add / Edit Production Plan</h1>
          <p className="page-subtitle">{monthLabel} · Day-wise entry for all bike models</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="month"
            className="input"
            style={{ width: 180 }}
            value={month}
            onChange={(e) => handleMonthChange(e.target.value)}
          />
          <button
            onClick={handleSave}
            disabled={isSaving || grandTotal === 0 || isLoading}
            className="btn btn-accent"
            style={{ opacity: isSaving || grandTotal === 0 || isLoading ? 0.4 : 1 }}
          >
            {isSaving ? "Saving..." : "💾 Save Plan"}
          </button>
          <Link href="/production-plan" className="btn btn-secondary" style={{ textDecoration: "none" }}>← Back</Link>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="card" style={{ padding: "12px 20px", marginBottom: 16, background: "rgba(220, 38, 38, 0.06)", border: "1px solid rgba(220, 38, 38, 0.2)", color: "var(--error)", fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="card" style={{ padding: "12px 20px", marginBottom: 16, background: "rgba(22, 163, 74, 0.06)", border: "1px solid rgba(22, 163, 74, 0.2)", color: "var(--success)", fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <div className="skeleton" style={{ width: 300, height: 24, margin: "0 auto" }} />
        </div>
      ) : (
        <>
          {/* Edit Table */}
          <div className="card">
        <div className="card-header">
          <h3><span>✏️</span> {monthLabel} — All Models</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="tag">{models.length} MODELS</span>
            <span className="tag" style={{ color: "var(--accent)" }}>TOTAL: {fmtN(grandTotal)}</span>
          </div>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
          <table className="data-table" style={{ minWidth: daysInMonth * 52 + 200 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 10, background: "var(--surface-alt)", minWidth: 160, borderRight: "2px solid var(--border)" }}>Bike Model</th>
                {dayKeys.map((day) => {
                  const dayNum = Number(day);
                  const sunday = isSunday(dayNum);
                  return (
                    <th key={day} style={{ textAlign: "center", minWidth: 50, background: sunday ? "rgba(220,38,38,0.04)" : undefined, padding: "4px 2px" }}>
                      <div style={{ fontSize: 9, color: sunday ? "var(--error)" : "var(--concrete)", fontFamily: "var(--font-mono)" }}>{getDayName(dayNum)}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: sunday ? "var(--error)" : "var(--charcoal)" }}>{day}</div>
                    </th>
                  );
                })}
                <th style={{ position: "sticky", right: 0, zIndex: 10, background: "var(--surface-alt)", textAlign: "right", minWidth: 70, borderLeft: "2px solid var(--border)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ position: "sticky", left: 0, zIndex: 5, background: "var(--surface)", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", minWidth: 160, borderRight: "2px solid var(--border-light)" }}>
                    {model.model_name}
                  </td>
                  {dayKeys.map((day) => {
                    const sunday = isSunday(Number(day));
                    return (
                      <td key={day} style={{ padding: "3px 2px", textAlign: "center", background: sunday ? "rgba(220,38,38,0.03)" : undefined }}>
                        <input
                          type="number"
                          min={0}
                          value={allData[model.id]?.[day] || ""}
                          onChange={(e) => handleDayChange(model.id, day, e.target.value)}
                          placeholder="0"
                          style={{
                            width: 44,
                            height: 28,
                            textAlign: "center",
                            border: `1px solid ${sunday ? "rgba(220,38,38,0.25)" : "var(--border)"}`,
                            borderRadius: 4,
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            color: "var(--charcoal)",
                            background: sunday ? "rgba(220,38,38,0.03)" : "var(--surface)",
                            padding: 0,
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="num" style={{ position: "sticky", right: 0, zIndex: 5, background: "var(--surface)", textAlign: "right", fontWeight: 700, fontSize: 13, color: getModelTotal(model.id) > 0 ? "var(--accent)" : "var(--concrete)", minWidth: 70, borderLeft: "2px solid var(--border-light)" }}>
                    {getModelTotal(model.id) > 0 ? fmtN(getModelTotal(model.id)) : "—"}
                  </td>
                </tr>
              ))}
              {/* Grand total row */}
              <tr style={{ background: "var(--surface-alt)", borderTop: "2px solid var(--charcoal)" }}>
                <td style={{ position: "sticky", left: 0, zIndex: 5, background: "var(--surface-alt)", fontWeight: 700, borderRight: "2px solid var(--border)" }}>TOTAL</td>
                {dayKeys.map((day) => {
                  const dayTotal = models.reduce((sum, m) => sum + (allData[m.id]?.[day] || 0), 0);
                  return (
                    <td key={day} className="num" style={{ textAlign: "center", fontWeight: 600, fontSize: 11, color: dayTotal > 0 ? "var(--charcoal)" : "var(--concrete)" }}>
                      {dayTotal > 0 ? dayTotal : ""}
                    </td>
                  );
                })}
                <td className="num" style={{ position: "sticky", right: 0, zIndex: 5, background: "var(--surface-alt)", textAlign: "right", fontWeight: 700, fontSize: 14, color: "var(--accent)", borderLeft: "2px solid var(--border)" }}>
                  {fmtN(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "16px 24px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
        <div style={{ display: "flex", gap: 32 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--concrete)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>Grand Total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--charcoal)", fontFamily: "var(--font-mono)" }}>{fmtN(grandTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--concrete)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>Models with Data</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--charcoal)", fontFamily: "var(--font-mono)" }}>{models.filter((m) => getModelTotal(m.id) > 0).length} / {models.length}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/production-plan" className="btn btn-secondary" style={{ textDecoration: "none" }}>← Back to Plan</Link>
          <button
            onClick={handleSave}
            disabled={isSaving || grandTotal === 0}
            className="btn btn-accent"
            style={{ opacity: isSaving || grandTotal === 0 ? 0.4 : 1 }}
          >
            {isSaving ? "Saving..." : "💾 Save Production Plan"}
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
