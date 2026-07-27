/**
 * Auth Guard Utility
 * ==================
 * Server-side helper to verify JWT and check admin role.
 * Used in API routes that require authentication or admin access.
 */

import { NextRequest } from "next/server";
import { verifyToken, JwtPayload } from "@/lib/jwt";
import { query, RowDataPacket } from "@/lib/db";

interface RoleRow extends RowDataPacket {
  id: number;
  role_name: string;
}

/**
 * Extract and verify JWT from request headers or cookies.
 * Returns the decoded payload or null if invalid.
 */
export function getAuthPayload(request: NextRequest): JwtPayload | null {
  // Try Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      return verifyToken(token);
    } catch {
      return null;
    }
  }

  // Fallback: try cookie
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      return verifyToken(cookieToken);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Check if the authenticated user has the Admin role.
 * Queries the database to verify the role_name for the user's roleId.
 */
export async function isAdminUser(payload: JwtPayload): Promise<boolean> {
  const rows = await query<RoleRow[]>(
    "SELECT id, role_name FROM roles WHERE id = ?",
    [payload.roleId]
  );
  if (rows.length === 0) return false;
  return rows[0].role_name === "Admin";
}

interface DepartmentRow extends RowDataPacket {
  id: number;
  department_name: string;
}

/**
 * Check if the user is allowed to edit production plans.
 * Only Admin role or users from the Sales department can edit.
 */
export async function canEditProductionPlan(request: NextRequest): Promise<boolean> {
  const roleId = Number(request.headers.get("x-role-id"));
  const departmentId = Number(request.headers.get("x-department-id"));

  // Check if Admin role
  const roleRows = await query<RoleRow[]>(
    "SELECT id, role_name FROM roles WHERE id = ?",
    [roleId]
  );
  if (roleRows.length > 0 && roleRows[0].role_name === "Admin") return true;

  // Check if Sales department
  const deptRows = await query<DepartmentRow[]>(
    "SELECT id, department_name FROM departments WHERE id = ?",
    [departmentId]
  );
  if (deptRows.length > 0 && deptRows[0].department_name === "Sales") return true;

  return false;
}
