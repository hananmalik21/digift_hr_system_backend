import PositionsModel from '../../positions/model/positions_model.js';
import {
  buildPositionFillStats,
  executeStatsQuery,
  rowCount,
} from '../../../../utils/statsUtils.js';

const STATS_SQL = `
  SELECT
    NVL(SUM(NUMBER_OF_POSITIONS), 0) AS TOTAL_POSITIONS,
    NVL(SUM(FILLED_POSITIONS), 0) AS FILLED_POSITIONS
  FROM ${PositionsModel.TABLE_NAME}
  WHERE TENANT_ID = :1
`;

class PositionStatsModel {
  /**
   * Get position statistics for an enterprise/tenant.
   * @param {number} enterpriseId - Enterprise/tenant ID (validated by controller)
   */
  static async getStats(enterpriseId) {
    const result = await executeStatsQuery(STATS_SQL, [enterpriseId]);
    const row = result.rows?.[0] || {};

    return buildPositionFillStats(
      rowCount(row, 'TOTAL_POSITIONS'),
      rowCount(row, 'FILLED_POSITIONS')
    );
  }
}

export default PositionStatsModel;
