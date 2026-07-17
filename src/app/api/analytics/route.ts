import { NextResponse } from "next/server";

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_POSTHOG_KEY;

async function posthogQuery(query: object) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/@current/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PostHog API error (${res.status}): ${errorText}`);
  }

  return res.json();
}

export async function GET() {
  if (!POSTHOG_API_KEY) {
    return NextResponse.json(
      { success: false, message: "PostHog API key not configured" },
      { status: 500 }
    );
  }

  try {
    // Run all queries in parallel
    const [
      pageViewsResult,
      uniqueUsersResult,
      topPagesResult,
      avgTimeSpentResult,
      recentEventsResult,
      loginCountResult,
      userSessionsResult,
    ] = await Promise.all([
      // Total page views in last 7 days
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT count() as total FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day`,
      }),

      // Unique identified users in last 7 days (only those who logged in)
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT count(DISTINCT distinct_id) as total FROM events WHERE event = 'user_logged_in' AND timestamp > now() - interval 7 day`,
      }),

      // Top pages by views in last 7 days
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT properties.$current_url as page, count() as views FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day GROUP BY page ORDER BY views DESC LIMIT 10`,
      }),

      // Average time spent on production plan page
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT avg(toFloat64OrNull(properties.time_spent_seconds)) as avg_seconds, max(toFloat64OrNull(properties.time_spent_seconds)) as max_seconds, count() as sessions FROM events WHERE event = 'production_plan_time_spent' AND timestamp > now() - interval 7 day`,
      }),

      // Recent events (last 50)
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT event, distinct_id, properties.$current_url as url, timestamp FROM events WHERE timestamp > now() - interval 1 day ORDER BY timestamp DESC LIMIT 50`,
      }),

      // Login count in last 7 days
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT count() as total, count(DISTINCT distinct_id) as unique_users FROM events WHERE event = 'user_logged_in' AND timestamp > now() - interval 7 day`,
      }),

      // Per-user login sessions with time spent
      posthogQuery({
        kind: "HogQLQuery",
        query: `SELECT
          e.distinct_id as user_id,
          count(DISTINCT CASE WHEN e.event = 'user_logged_in' THEN e.timestamp ELSE NULL END) as login_count,
          min(CASE WHEN e.event = 'user_logged_in' THEN e.timestamp ELSE NULL END) as first_login,
          max(CASE WHEN e.event = 'user_logged_in' THEN e.timestamp ELSE NULL END) as last_login,
          sum(CASE WHEN e.event = 'production_plan_time_spent' THEN toFloat64OrNull(e.properties.time_spent_seconds) ELSE 0 END) as total_time_seconds,
          count(CASE WHEN e.event = '$pageview' THEN 1 ELSE NULL END) as page_views
        FROM events e
        WHERE e.event IN ('user_logged_in', 'production_plan_time_spent', '$pageview')
          AND e.timestamp > now() - interval 7 day
          AND e.distinct_id LIKE '%@%'
        GROUP BY e.distinct_id
        ORDER BY last_login DESC
        LIMIT 20`,
      }),
    ]);

    // Parse results
    const pageViews = pageViewsResult?.results?.[0]?.[0] || 0;
    const uniqueUsers = uniqueUsersResult?.results?.[0]?.[0] || 0;

    const topPages = (topPagesResult?.results || []).map((row: string[]) => ({
      page: row[0] || "Unknown",
      views: row[1] || 0,
    }));

    const avgTimeSpent = {
      avgSeconds: Math.round(avgTimeSpentResult?.results?.[0]?.[0] || 0),
      maxSeconds: Math.round(avgTimeSpentResult?.results?.[0]?.[1] || 0),
      sessions: avgTimeSpentResult?.results?.[0]?.[2] || 0,
    };

    const recentEvents = (recentEventsResult?.results || []).map((row: string[]) => ({
      event: row[0],
      user: row[1],
      url: row[2],
      timestamp: row[3],
    }));

    const loginStats = {
      totalLogins: loginCountResult?.results?.[0]?.[0] || 0,
      uniqueUsers: loginCountResult?.results?.[0]?.[1] || 0,
    };

    const userSessions = (userSessionsResult?.results || []).map((row: (string | number)[]) => ({
      userId: row[0],
      loginCount: row[1] || 0,
      firstLogin: row[2],
      lastLogin: row[3],
      totalTimeSeconds: Math.round(Number(row[4]) || 0),
      pageViews: row[5] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        pageViews,
        uniqueUsers,
        topPages,
        avgTimeSpent,
        recentEvents,
        loginStats,
        userSessions,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Analytics API error:", message);
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
