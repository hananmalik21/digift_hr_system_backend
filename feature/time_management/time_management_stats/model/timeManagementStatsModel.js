import db from '../../../../config/db.js';
import oracledb from 'oracledb';

const STATS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM ENT.TM_SHIFTS WHERE TENANT_ID = :1) AS TOTAL_SHIFTS,
    (SELECT COUNT(*) FROM ENT.TM_WORK_PATTERNS WHERE TENANT_ID = :1) AS TOTAL_WORK_PATTERNS,
    (SELECT COUNT(*) FROM ENT.TM_WORK_SCHEDULES WHERE TENANT_ID = :1) AS TOTAL_WORK_SCHEDULES,
    (SELECT COUNT(*) FROM ENT.TM_SCHEDULE_ASSIGNMENTS WHERE TENANT_ID = :1) AS TOTAL_SCHEDULE_ASSIGNMENTS
  FROM DUAL
`;

function toCount(value) {
  return Number(value ?? 0) || 0;
}

class TimeManagementStatsModel {
  static async executeQuery(query, bindParams = [], options = {}) {
    return db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
  }

  /**
   * Get time management statistics for an enterprise/tenant.
   * @param {number} enterpriseId - Enterprise/tenant ID (validated by controller)
   * @returns {Promise<{
   *   total_shifts: number,
   *   total_work_patterns: number,
   *   total_work_schedules: number,
   *   total_schedule_assignments: number
   * }>}
   */
  static async getStats(enterpriseId) {
    const result = await this.executeQuery(STATS_SQL, [enterpriseId]);
    const row = result.rows?.[0] || {};

    return {
      total_shifts: toCount(row.TOTAL_SHIFTS),
      total_work_patterns: toCount(row.TOTAL_WORK_PATTERNS),
      total_work_schedules: toCount(row.TOTAL_WORK_SCHEDULES),
      total_schedule_assignments: toCount(row.TOTAL_SCHEDULE_ASSIGNMENTS),
    };
  }
}

export default TimeManagementStatsModel;
