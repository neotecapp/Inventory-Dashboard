import { query, RowDataPacket } from "@/lib/db";
import {
  YearlyBikeProductionRow,
  YearlyProductionPlan,
  ParentBike,
} from "@/models/yearlyProduction";
import {
  YEARLY_BIKE_PRODUCTION_BY_YEAR,
  PARENT_BIKES_ALL,
} from "@/lib/queries";

class YearlyProductionRepository {
  /**
   * Find all yearly production plans for a given year.
   * Year param comes as a number (e.g. 2026).
   */
  async findByYear(year: number): Promise<YearlyProductionPlan[]> {
    const rows = await query<YearlyBikeProductionRow[]>(
      YEARLY_BIKE_PRODUCTION_BY_YEAR,
      [year]
    );

    return rows.map((row) => ({
      id: row.id,
      month: row.month,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
      parent_id: row.parent_id,
      parent_bike_name: row.parent_bike_name,
    }));
  }

  /**
   * Get all parent bikes for dropdown/filter purposes.
   */
  async getAllParentBikes(): Promise<ParentBike[]> {
    return query<ParentBike[]>(PARENT_BIKES_ALL);
  }

  /**
   * Get distinct years available in the yearly_bike_production table.
   */
  async getAvailableYears(): Promise<number[]> {
    const rows = await query<RowDataPacket[]>(
      `SELECT DISTINCT YEAR(month) AS year FROM yearly_bike_production ORDER BY year DESC`
    );
    return rows.map((r) => r.year as number);
  }
}

export const yearlyProductionRepository = new YearlyProductionRepository();
