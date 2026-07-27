/**
 * GET /api/production-plan?month=2026-07
 * POST /api/production-plan
 * PUT /api/production-plan
 * DELETE /api/production-plan?id=123
 * =======================================
 * CRUD for daily production plans.
 * Data comes from `monthly_production_plan` table in `inventory_dashboard` DB.
 * Each row has a JSON `data` column: { "1": qty, "2": qty, ... "31": qty }
 */

import { NextRequest, NextResponse } from "next/server";
import { productionPlanService } from "@/services/productionPlanService";
import { getAuthPayload } from "@/lib/authGuard";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { z } from "zod";

// Validation: data is an object with day keys ("1"-"31") mapped to non-negative integers
const dayDataSchema = z.record(
  z.string().regex(/^([1-9]|[12]\d|3[01])$/),
  z.number().int().min(0)
);

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM format"),
  bike_model_id: z.number().int().positive(),
  data: dayDataSchema,
});

const updateSchema = z.object({
  id: z.number().int().positive(),
  data: dayDataSchema,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || getCurrentMonth();

    const [plans, models] = await Promise.all([
      productionPlanService.getByMonth(month),
      productionPlanService.getBikeModels(),
    ]);

    return NextResponse.json({
      success: true,
      data: { month, plans, models },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = getAuthPayload(request);
    if (!payload) {
      return errorResponse("Unauthorized — please log in", 401);
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse("Validation failed", 400, `${firstIssue.path.join(".")}: ${firstIssue.message}`);
    }

    const insertId = await productionPlanService.create({
      month: `${parsed.data.month}-01`,
      bike_model_id: parsed.data.bike_model_id,
      data: parsed.data.data,
    });

    return successResponse({ id: insertId }, "Production plan created", 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("already exists") ? 409 : 500;
    return errorResponse(message, status);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = getAuthPayload(request);
    if (!payload) {
      return errorResponse("Unauthorized — please log in", 401);
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse("Validation failed", 400, `${firstIssue.path.join(".")}: ${firstIssue.message}`);
    }

    await productionPlanService.update(parsed.data.id, parsed.data.data);
    return successResponse(null, "Production plan updated");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("not found") ? 404 : 500;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = getAuthPayload(request);
    if (!payload) {
      return errorResponse("Unauthorized — please log in", 401);
    }

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!id || isNaN(id)) {
      return errorResponse("Missing or invalid plan id", 400);
    }

    await productionPlanService.delete(id);
    return successResponse(null, "Production plan deleted");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status = message.includes("not found") ? 404 : 500;
    return errorResponse(message, status);
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
