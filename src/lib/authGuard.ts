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
