import { entInvokeWithConnection, toSnakeCaseDeep } from '../../shared/entDbClient.js';

class PositionStatsModel {
  /**
   * @param {number} enterpriseId
   */
  static async getStats(enterpriseId) {
    const { data } = await entInvokeWithConnection('STATS', 'GET_WORKFORCE', {
      enterprise_id: Number(enterpriseId)
    });
    const row = toSnakeCaseDeep(data) ?? {};
    return row.positions_stats ?? {
      total_positions: 0,
      filled_positions: 0,
      vacant_positions: 0,
      fill_rate_pct: 0
    };
  }
}

export default PositionStatsModel;
