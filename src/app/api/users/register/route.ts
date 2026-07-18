/**
 * POST /api/users/register
 * ========================
 * Registers a new user in the system.
 *
 * This route handler:
 * 1. Verifies the request is from an authenticated admin user
 * 2. Parses the JSON request body
 * 3. Validates input using Zod schema
 * 4. Calls the userService to handle business logic
 * 5. Returns appropriate success/error responses
 *
 * Requires: Admin authentication (JWT with Admin role)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { registerUser } from "@/services/userService";
import { getAuthPayload, isAdminUser } from "@/lib/authGuard";

// ─── Validation Schema ──────────────────────────────────────────────────────

const permissionSchema = z.object({
  module_name: z.string().min(1, "module_name is required"),
  can_view: z.boolean(),
  can_create: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
});

const registerSchema = z.object({
  employee_id: z.string().min(1, "employee_id is required").max(30),
  name: z.string().min(1, "name is required").max(150),
  email: z.email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role_id: z.number().int().positive("role_id must be a positive integer"),
  department_id: z.number().int().positive("department_id must be a positive integer"),
  permissions: z.array(permissionSchema).min(1, "At least one permission is required"),
});

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Step 0: Verify admin authentication
    const payload = getAuthPayload(request);
    if (!payload) {
      return errorResponse("Unauthorized — please log in", 401);
    }

    const adminCheck = await isAdminUser(payload);
    if (!adminCheck) {
      return errorResponse("Forbidden — admin access required", 403);
    }

    // Step 1: Parse request body
    const body = await request.json();

    // Step 2: Validate input
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse(
        "Validation failed",
        400,
        `${firstIssue.path.join(".")}: ${firstIssue.message}`
      );
    }

    // Step 3: Call service
    const result = await registerUser(parsed.data);

    // Step 4: Return success
    return successResponse(result.user, "User registered successfully", 201);
  } catch (error: any) {
    // Handle known business errors (thrown with status)
    if (error.status) {
      return errorResponse(error.message, error.status);
    }

    // Handle unexpected errors
    console.error("Registration error:", error);
    return errorResponse("Internal server error", 500);
  }
}
