import db from '../../../config/db.js';
import oracledb from 'oracledb';

class WorkforceStatsModel {
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
   * Get workforce structure statistics
   * Returns total counts for positions, job levels, job families, and grades
   */
  static async getStats() {
    try {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM ENT.POSITIONS) AS TOTAL_POSITIONS,
          (SELECT COUNT(*) FROM ENT.JOB_LEVELS) AS TOTAL_JOB_LEVELS,
          (SELECT COUNT(*) FROM ENT.JOB_FAMILIES) AS TOTAL_JOB_FAMILIES,
          (SELECT COUNT(*) FROM ENT.GRADES) AS TOTAL_GRADES
        FROM DUAL
      `;

      const result = await this.executeQuery(sql);
      const row = result.rows?.[0] || {};

      return {
        total_positions: Number(row.TOTAL_POSITIONS || row.total_positions || 0),
        total_job_levels: Number(row.TOTAL_JOB_LEVELS || row.total_job_levels || 0),
        total_job_families: Number(row.TOTAL_JOB_FAMILIES || row.total_job_families || 0),
        total_grades: Number(row.TOTAL_GRADES || row.total_grades || 0),
      };
    } catch (error) {
      throw new Error(`Failed to fetch workforce structure stats: ${error.message}`);
    }
  }
}

export default WorkforceStatsModel;
