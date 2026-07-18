"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

interface Role {
  id: number;
  role_name: string;
}

interface Department {
  id: number;
  department_name: string;
}

interface Module {
  id: number;
  module_name: string;
}

interface PermissionEntry {
  module_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export default function RegisterUserPage() {
  const router = useRouter();
  const { isAdmin, user } = useAuthStore();

  // Form fields
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<number>(0);
  const [departmentId, setDepartmentId] = useState<number>(0);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);

  // Options from API
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<Module[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Admin guard
  useEffect(() => {
    if (user && !isAdmin()) {
      router.replace("/production-plan");
    }
  }, [user, isAdmin, router]);

  // Fetch registration options
  useEffect(() => {
    async function fetchOptions() {
      try {
        const res = await apiClient.get("/registration-options");
        if (res.data?.data) {
          setRoles(res.data.data.roles || []);
          setDepartments(res.data.data.departments || []);
          const mods = res.data.data.modules || [];
          setModules(mods);
          // Initialize permissions with all modules set to view-only
          setPermissions(
            mods.map((m: Module) => ({
              module_name: m.module_name,
              can_view: true,
              can_create: false,
              can_edit: false,
              can_delete: false,
            }))
          );
        }
      } catch {
        setError("Failed to load registration options");
      } finally {
        setOptionsLoading(false);
      }
    }
    fetchOptions();
  }, []);

  function handlePermissionChange(
    moduleIndex: number,
    field: keyof Omit<PermissionEntry, "module_name">,
    value: boolean
  ) {
    setPermissions((prev) => {
      const updated = [...prev];
      updated[moduleIndex] = { ...updated[moduleIndex], [field]: value };
      return updated;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await apiClient.post("/users/register", {
        employee_id: employeeId,
        name,
        email,
        password,
        role_id: roleId,
        department_id: departmentId,
        permissions: permissions.filter(
          (p) => p.can_view || p.can_create || p.can_edit || p.can_delete
        ),
      });

      if (res.data?.sucess || res.status === 201) {
        setSuccess(`User "${name}" registered successfully!`);
        // Reset form
        setEmployeeId("");
        setName("");
        setEmail("");
        setPassword("");
        setRoleId(0);
        setDepartmentId(0);
        setPermissions(
          modules.map((m) => ({
            module_name: m.module_name,
            can_view: true,
            can_create: false,
            can_edit: false,
            can_delete: false,
          }))
        );
      } else {
        setError(res.data?.message || "Registration failed");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!user || !isAdmin()) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <p style={{ color: "var(--text-muted)" }}>Access denied. Admin only.</p>
      </div>
    );
  }

  if (optionsLoading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 40, marginBottom: 24, width: 300 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Register New User</h1>
          <p className="page-subtitle">Create a new user account with role and permissions</p>
        </div>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div
          className="card"
          style={{
            padding: "12px 20px",
            marginBottom: 20,
            borderLeft: "3px solid var(--success)",
            background: "rgba(34, 197, 94, 0.05)",
          }}
        >
          <p style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>✓ {success}</p>
        </div>
      )}
      {error && (
        <div
          className="card"
          style={{
            padding: "12px 20px",
            marginBottom: 20,
            borderLeft: "3px solid var(--danger, #ef4444)",
            background: "rgba(239, 68, 68, 0.05)",
          }}
        >
          <p style={{ color: "var(--danger, #ef4444)", fontSize: 13, fontWeight: 600 }}>✗ {error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* User Details Card */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>User Details</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Employee ID */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Employee ID *
              </label>
              <input
                type="text"
                className="login-input"
                placeholder="e.g. EMP001"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            {/* Name */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Full Name *
              </label>
              <input
                type="text"
                className="login-input"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Email *
              </label>
              <input
                type="email"
                className="login-input"
                placeholder="e.g. john@revoltmotors.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Password * (min 6 characters)
              </label>
              <input
                type="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{ width: "100%" }}
              />
            </div>

            {/* Role */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Role *
              </label>
              <select
                className="login-input"
                value={roleId}
                onChange={(e) => setRoleId(Number(e.target.value))}
                required
                style={{ width: "100%" }}
              >
                <option value={0} disabled>Select a role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.role_name}</option>
                ))}
              </select>
            </div>

            {/* Department */}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                Department *
              </label>
              <select
                className="login-input"
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
                required
                style={{ width: "100%" }}
              >
                <option value={0} disabled>Select a department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.department_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Module Permissions Card */}
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Module Permissions</h3>

          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Module</th>
                  <th style={{ textAlign: "center", width: 80 }}>View</th>
                  <th style={{ textAlign: "center", width: 80 }}>Create</th>
                  <th style={{ textAlign: "center", width: 80 }}>Edit</th>
                  <th style={{ textAlign: "center", width: 80 }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm, idx) => (
                  <tr key={perm.module_name}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{perm.module_name}</td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={perm.can_view}
                        onChange={(e) => handlePermissionChange(idx, "can_view", e.target.checked)}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={perm.can_create}
                        onChange={(e) => handlePermissionChange(idx, "can_create", e.target.checked)}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={perm.can_edit}
                        onChange={(e) => handlePermissionChange(idx, "can_edit", e.target.checked)}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={perm.can_delete}
                        onChange={(e) => handlePermissionChange(idx, "can_delete", e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
                {permissions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}>
                      No modules available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn btn-accent"
          disabled={loading || roleId === 0 || departmentId === 0}
          style={{ height: 40, fontSize: 13, padding: "0 24px" }}
        >
          {loading ? "Registering..." : "Register User"}
        </button>
      </form>
    </div>
  );
}
