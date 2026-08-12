import { executeStatsQuery, rowCount } from '../../../../utils/statsUtils.js';

const STATS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM TM.TM_SHIFTS WHERE TENANT_ID = :1) AS TOTAL_SHIFTS,
    (SELECT COUNT(*) FROM TM.TM_WORK_PATTERNS WHERE TENANT_ID = :1) AS TOTAL_WORK_PATTERNS,
    (SELECT COUNT(*) FROM TM.TM_WORK_SCHEDULES WHERE TENANT_ID = :1) AS TOTAL_WORK_SCHEDULES,
    (SELECT COUNT(*) FROM TM.TM_SCHEDULE_ASSIGNMENTS WHERE TENANT_ID = :1) AS TOTAL_SCHEDULE_ASSIGNMENTS
  FROM DUAL
`;

class TimeManagementStatsModel {
  /**
   * Get time management statistics for an enterprise/tenant.
   * @param {number} enterpriseId - Enterprise/tenant ID (validated by controller)
   */
  static async getStats(enterpriseId) {
    const result = await executeStatsQuery(STATS_SQL, [enterpriseId]);
    const row = result.rows?.[0] || {};

    return {
      total_shifts: rowCount(row, 'TOTAL_SHIFTS'),
      total_work_patterns: rowCount(row, 'TOTAL_WORK_PATTERNS'),
      total_work_schedules: rowCount(row, 'TOTAL_WORK_SCHEDULES'),
      total_schedule_assignments: rowCount(row, 'TOTAL_SCHEDULE_ASSIGNMENTS'),
    };
  }
}

export default TimeManagementStatsModel;
