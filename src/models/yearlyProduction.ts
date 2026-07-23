import { RowDataPacket } from "mysql2/promise";

/**
 * Raw row from yearly_bike_production table joined with parent_bikes.
 * `data` is a JSON object with bike model names mapped to quantities.
 */
export interface YearlyBikeProductionRow extends RowDataPacket {
  id: number;
  month: string; // date stored as 'YYYY-MM-DD' (first of month)
  data: Record<string, number>; // { "RV400": 500, "RV400 BRZ": 200, ... }
  parent_id: number | null;
  parent_bike_name: string | null;
}

/**
 * Shape returned by the API after processing.
 */
export interface YearlyProductionPlan {
  id: number;
  month: string;
  data: Record<string, number>;
  parent_id: number | null;
  parent_bike_name: string | null;
}

export interface ParentBike extends RowDataPacket {
  id: number;
  name: string;
}
