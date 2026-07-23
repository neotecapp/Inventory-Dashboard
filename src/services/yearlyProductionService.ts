import { yearlyProductionRepository } from "@/repository/yearlyProductionRepository";
import { YearlyProductionPlan, ParentBike } from "@/models/yearlyProduction";

class YearlyProductionService {
  async getByYear(year: number): Promise<YearlyProductionPlan[]> {
    return yearlyProductionRepository.findByYear(year);
  }

  /**
   * Get production plans with bike IDs in the data JSON resolved to names
   * using the parent_bikes table.
   */
  async getByYearResolved(year: number): Promise<YearlyProductionPlan[]> {
    const [plans, parentBikes] = await Promise.all([
      yearlyProductionRepository.findByYear(year),
      yearlyProductionRepository.getAllParentBikes(),
    ]);

    // Build id → name lookup
    const bikeNameMap = new Map<string, string>();
    parentBikes.forEach((pb) => {
      bikeNameMap.set(String(pb.id), pb.name);
    });

    // Resolve numeric IDs in data JSON to bike names
    return plans.map((plan) => {
      const resolvedData: Record<string, number> = {};
      Object.entries(plan.data).forEach(([key, qty]) => {
        const name = bikeNameMap.get(key) || key;
        resolvedData[name] = (resolvedData[name] || 0) + (qty || 0);
      });
      return { ...plan, data: resolvedData };
    });
  }

  async getParentBikes(): Promise<ParentBike[]> {
    return yearlyProductionRepository.getAllParentBikes();
  }

  async getAvailableYears(): Promise<number[]> {
    return yearlyProductionRepository.getAvailableYears();
  }
}

export const yearlyProductionService = new YearlyProductionService();
