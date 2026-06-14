import PositionStatsModel from '../../position_stats/model/positionStatsModel.js';
import { executeStatsQuery, rowCount } from '../../../../utils/statsUtils.js';

const COUNTS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM ENT.POSITIONS WHERE TENANT_ID = :1) AS TOTAL_POSITIONS,
    (SELECT COUNT(*) FROM ENT.JOB_LEVELS WHERE TENANT_ID = :1) AS TOTAL_JOB_LEVELS,
    (SELECT COUNT(*) FROM ENT.JOB_FAMILIES WHERE TENANT_ID = :1) AS TOTAL_JOB_FAMILIES,
    (SELECT COUNT(*) FROM ENT.GRADES WHERE TENANT_ID = :1) AS TOTAL_GRADES
  FROM DUAL
`;

class WorkforceStatsModel {
  /**
   * Get workforce structure statistics for an enterprise/tenant.
   * @param {number} enterpriseId - Enterprise/tenant ID (validated by controller)
   */
  static async getStats(enterpriseId) {
    const [countsResult, positionsStats] = await Promise.all([
      executeStatsQuery(COUNTS_SQL, [enterpriseId]),
      PositionStatsModel.getStats(enterpriseId),
    ]);

    const row = countsResult.rows?.[0] || {};

    return {
      total_positions: rowCount(row, 'TOTAL_POSITIONS'),
      total_job_levels: rowCount(row, 'TOTAL_JOB_LEVELS'),
      total_job_families: rowCount(row, 'TOTAL_JOB_FAMILIES'),
      total_grades: rowCount(row, 'TOTAL_GRADES'),
      positions_stats: positionsStats,
    };
  }
}

export default WorkforceStatsModel;
