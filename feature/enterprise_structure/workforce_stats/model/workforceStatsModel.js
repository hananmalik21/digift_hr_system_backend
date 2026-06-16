import { entInvokeWithConnection, toSnakeCaseDeep } from '../../shared/entDbClient.js';

class WorkforceStatsModel {
  /**
   * @param {number} enterpriseId
   */
  static async getStats(enterpriseId) {
    const { data } = await entInvokeWithConnection('STATS', 'GET_WORKFORCE', {
      enterprise_id: Number(enterpriseId)
    });
    const row = toSnakeCaseDeep(data) ?? {};
    return {
      position_records: Number(row.position_records ?? 0) || 0,
      total_job_levels: Number(row.total_job_levels ?? 0) || 0,
      total_job_families: Number(row.total_job_families ?? 0) || 0,
      total_grades: Number(row.total_grades ?? 0) || 0,
      positions_stats: toSnakeCaseDeep(row.positions_stats) ?? {
        total_positions: 0,
        filled_positions: 0,
        vacant_positions: 0,
        fill_rate_pct: 0
      }
    };
  }
}

export default WorkforceStatsModel;
