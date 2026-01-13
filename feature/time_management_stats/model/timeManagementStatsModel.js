import db from '../../../config/db.js';
import oracledb from 'oracledb';

class TimeManagementStatsModel {
  static async executeQuery(query, bindParams = [], options = {}) {
    try {
      const result = await db.executeQuery(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        ...options,
      });
      return result;
    } catch (error) {
      console.error('SQL Query Error:', error.message);
      console.error('SQL (first 300):', String(query).slice(0, 300));
      throw error;
    }
  }

  /**
   * Get time management statistics
   * Returns total counts for shifts, work patterns, work schedules, and schedule assignments
   */
  static async getStats() {
    try {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM ENT.TM_SHIFTS) AS TOTAL_SHIFTS,
          (SELECT COUNT(*) FROM ENT.TM_WORK_PATTERNS) AS TOTAL_WORK_PATTERNS,
          (SELECT COUNT(*) FROM ENT.TM_WORK_SCHEDULES) AS TOTAL_WORK_SCHEDULES,
          (SELECT COUNT(*) FROM ENT.TM_SCHEDULE_ASSIGNMENTS) AS TOTAL_SCHEDULE_ASSIGNMENTS
        FROM DUAL
      `;

      const result = await this.executeQuery(sql);
      const row = result.rows?.[0] || {};

      return {
        total_shifts: Number(row.TOTAL_SHIFTS || row.total_shifts || 0),
        total_work_patterns: Number(row.TOTAL_WORK_PATTERNS || row.total_work_patterns || 0),
        total_work_schedules: Number(row.TOTAL_WORK_SCHEDULES || row.total_work_schedules || 0),
        total_schedule_assignments: Number(row.TOTAL_SCHEDULE_ASSIGNMENTS || row.total_schedule_assignments || 0),
      };
    } catch (error) {
      throw new Error(`Failed to fetch time management stats: ${error.message}`);
    }
  }
}

export default TimeManagementStatsModel;
