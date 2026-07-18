"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import posthog from 'posthog-js'


const NAV_ITEMS = [
  // { href: "/monthly-procurement", label: "Monthly Procurement" },
  // { href: "/current-inventory", label: "Current Inventory" },
  { href: "/production-plan", label: "Production Plan" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/analytics", label: "Analytics" },
  { href: "/register-user", label: "Register User" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, setAuth, isAdmin } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) {
      router.replace("/login");
      return;
    }
    // Hydrate store from localStorage if not already set
    if (!user) {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setAuth(stored, parsed);
        } catch {
          router.replace("/login");
          return;
        }
      }
    }
    setReady(true);
  }, [router, user, setAuth]);

    function handleLogout() {
      posthog.reset();
      logout();
      posthog.capture('user_logged_out');
      router.replace("/login");
    }

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="skeleton" style={{ width: 200, height: 24 }} />
      </div>
    );
  }

  return (
    <div>
      {/* Top Navbar */}
      <header className="topbar">
        <div className="topbar-inner">
          {/* Left: Brand + Nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <Link href="/production-plan" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius)",
                background: "rgba(37, 99, 235, 0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                <img
                  src="/images/revolt-icon.svg"
                  alt="Revolt Motors"
                  style={{ height: 20, objectFit: "contain" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}>Revolt Motors</span>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 500,
                  color: "rgba(255, 255, 255, 0.45)",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}>Inventory Dashboard</span>
              </div>
            </Link>

            <div style={{ width: 1, height: 24, background: "rgba(255, 255, 255, 0.1)" }} />

            <nav className="topbar-nav">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "active" : ""}
                >
                  {item.label}
                </Link>
              ))}
              {isAdmin() && ADMIN_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={pathname === item.href ? "active" : ""}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: User + Logout */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {user && (
              <span style={{
                fontSize: 12,
                color: "rgba(255, 255, 255, 0.7)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.3px",
              }}>
                {user.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              style={{
                height: 32,
                fontSize: 12,
                padding: "0 14px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "var(--radius)",
                color: "rgba(255, 255, 255, 0.85)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content-top">{children}</main>
    </div>
  );
}
