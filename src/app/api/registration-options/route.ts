/**
 * GET /api/registration-options
 * =============================
 * Returns available roles, departments, and modules for the registration form.
 * Admin-only endpoint.
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { getAuthPayload, isAdminUser } from "@/lib/authGuard";
import { query, RowDataPacket } from "@/lib/db";

interface RoleRow extends RowDataPacket {
  id: number;
  role_name: string;
}

interface DepartmentRow extends RowDataPacket {
  id: number;
  department_name: string;
}

interface ModuleRow extends RowDataPacket {
  id: number;
  module_name: string;
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const payload = getAuthPayload(request);
    if (!payload) {
      return errorResponse("Unauthorized — please log in", 401);
    }

    const adminCheck = await isAdminUser(payload);
    if (!adminCheck) {
      return errorResponse("Forbidden — admin access required", 403);
    }

    // Fetch all options
    const [roles, departments, modules] = await Promise.all([
      query<RoleRow[]>("SELECT id, role_name FROM roles ORDER BY id"),
      query<DepartmentRow[]>("SELECT id, department_name FROM departments ORDER BY department_name"),
      query<ModuleRow[]>("SELECT id, module_name FROM modules ORDER BY module_name"),
    ]);

    return successResponse({ roles, departments, modules }, "Registration options fetched");
  } catch (error) {
    console.error("Error fetching registration options:", error);
    return errorResponse("Internal server error", 500);
  }
}
