/**
 * GET /api/yearly-production?year=2026
 * =====================================
 * Returns the yearly production plan for a given year.
 * Data comes from `yearly_bike_production` table joined with `parent_bikes`.
 * Each row has a JSON `data` column with bike model quantities per month.
 * Also returns BOM data aggregated by parent bike for part-wise breakdown.
 */

import { NextRequest } from "next/server";
import { yearlyProductionService } from "@/services/yearlyProductionService";
import { getBomWithParentBikeMapping } from "@/services/inventoryService";
import { successResponse, errorResponse } from "@/lib/apiResponse";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year") || String(new Date().getFullYear());
    const year = Number(yearParam);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return errorResponse("Invalid year parameter", 400);
    }

    const [plans, parentBikes, availableYears, bomParentBikeData] = await Promise.all([
      yearlyProductionService.getByYearResolved(year),
      yearlyProductionService.getParentBikes(),
      yearlyProductionService.getAvailableYears(),
      getBomWithParentBikeMapping(),
    ]);

    return successResponse({
      year,
      plans,
      parentBikes,
      availableYears,
      bomParentBikeData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return errorResponse(message, 500);
  }
}
