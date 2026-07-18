"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

interface AnalyticsData {
  pageViews: number;
  uniqueUsers: number;
  topPages: { page: string; views: number }[];
  avgTimeSpent: { avgSeconds: number; maxSeconds: number; sessions: number };
  recentEvents: { event: string; user: string; url: string; timestamp: string }[];
  loginStats: { totalLogins: number; uniqueUsers: number };
  userSessions: { userId: string; loginCount: number; firstLogin: string; lastLogin: string; totalTimeSeconds: number; pageViews: number }[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatPageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url || "/";
  }
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isAdmin, user } = useAuthStore();

  // Admin guard
  useEffect(() => {
    if (user && !isAdmin()) {
      router.replace("/production-plan");
    }
  }, [user, isAdmin, router]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get("/analytics");
      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || "Failed to load analytics");
      }
    } catch {
      setError("Failed to fetch analytics data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
        <div className="skeleton" style={{ height: 300, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: "var(--text-muted)", marginBottom: 20, fontSize: 15 }}>{error}</p>
        <button onClick={fetchAnalytics} className="btn btn-accent">Try Again</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">Last 7 days · PostHog Event Tracking</p>
        </div>
        <button onClick={fetchAnalytics} className="btn btn-secondary">↻ Refresh</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 28 }}>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Page Views</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "var(--accent)" }}>{data.pageViews.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Last 7 days</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Unique Users</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>{data.uniqueUsers.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Last 7 days</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Avg Time on Prod. Plan</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>{formatDuration(data.avgTimeSpent.avgSeconds)}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Max: {formatDuration(data.avgTimeSpent.maxSeconds)} · {data.avgTimeSpent.sessions} sessions</p>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Total Logins</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "var(--purple, #7C3AED)" }}>{data.loginStats.totalLogins.toLocaleString()}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{data.loginStats.uniqueUsers} unique users</p>
        </div>
      </div>

      {/* Two column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {/* Top Pages */}
        <div className="card">
          <div className="card-header">
            <h3><span>📊</span> Top Pages</h3>
            <span className="tag">{data.topPages.length} PAGES</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th style={{ textAlign: "right" }}>Views</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages.map((page, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{formatPageUrl(page.page)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(page.views).toLocaleString()}</td>
                  </tr>
                ))}
                {data.topPages.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>No page view data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Time Spent Breakdown */}
        <div className="card">
          <div className="card-header">
            <h3><span>⏱️</span> Time Spent Summary</h3>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--surface-alt)", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Average Session (Production Plan)</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{formatDuration(data.avgTimeSpent.avgSeconds)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--surface-alt)", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Longest Session (Production Plan)</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--warning)" }}>{formatDuration(data.avgTimeSpent.maxSeconds)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--surface-alt)", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Total Sessions Tracked</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{data.avgTimeSpent.sessions}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--surface-alt)", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Logins (7 days)</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--purple, #7C3AED)" }}>{data.loginStats.totalLogins}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Sessions */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <h3><span>👤</span> User Sessions (Last 7 Days)</h3>
          <span className="tag">{data.userSessions.length} USERS</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>User</th>
                <th style={{ textAlign: "center", minWidth: 80 }}>Logins</th>
                <th style={{ textAlign: "center", minWidth: 80 }}>Page Views</th>
                <th style={{ textAlign: "center", minWidth: 120 }}>Time Spent</th>
                <th style={{ minWidth: 150 }}>Last Login</th>
                <th style={{ minWidth: 150 }}>First Login</th>
              </tr>
            </thead>
            <tbody>
              {data.userSessions.map((user, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600, fontSize: 12, fontFamily: "var(--font-mono)" }}>{user.userId}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{Number(user.loginCount).toLocaleString()}</td>
                  <td style={{ textAlign: "center" }}>{Number(user.pageViews).toLocaleString()}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "var(--accent)" }}>{formatDuration(user.totalTimeSeconds)}</td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.lastLogin ? timeAgo(user.lastLogin) : "—"}</td>
                  <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.firstLogin ? timeAgo(user.firstLogin) : "—"}</td>
                </tr>
              ))}
              {data.userSessions.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No user session data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3><span>🕐</span> Recent Activity (Last 24h)</h3>
          <span className="tag">{data.recentEvents.length} EVENTS</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Event</th>
                <th style={{ minWidth: 180 }}>User</th>
                <th style={{ minWidth: 160 }}>Page</th>
                <th style={{ minWidth: 100, textAlign: "right" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEvents.map((evt, idx) => (
                <tr key={idx}>
                  <td>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: evt.event.startsWith("$") ? "var(--surface-alt)" : "rgba(37, 99, 235, 0.1)",
                      color: evt.event.startsWith("$") ? "var(--text-muted)" : "var(--accent)",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {evt.event}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {evt.user?.includes("@") ? evt.user : (evt.user?.substring(0, 12) + "...")}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{formatPageUrl(evt.url)}</td>
                  <td style={{ textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(evt.timestamp)}</td>
                </tr>
              ))}
              {data.recentEvents.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No recent events</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
