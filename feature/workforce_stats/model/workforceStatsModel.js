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
   * Also includes positions_stats with detailed position metrics
   */
  static async getStats() {
    try {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM ENT.POSITIONS) AS TOTAL_POSITIONS,
          (SELECT COUNT(*) FROM ENT.JOB_LEVELS) AS TOTAL_JOB_LEVELS,
          (SELECT COUNT(*) FROM ENT.JOB_FAMILIES) AS TOTAL_JOB_FAMILIES,
          (SELECT COUNT(*) FROM ENT.GRADES) AS TOTAL_GRADES,
          (SELECT NVL(SUM(NUMBER_OF_POSITIONS), 0) FROM ENT.POSITIONS) AS TOTAL_POSITIONS_COUNT,
          (SELECT NVL(SUM(FILLED_POSITIONS), 0) FROM ENT.POSITIONS) AS TOTAL_FILLED_POSITIONS
        FROM DUAL
      `;

      const result = await this.executeQuery(sql);
      const row = result.rows?.[0] || {};

      const totalPositionsCount = Number(row.TOTAL_POSITIONS_COUNT || row.total_positions_count || 0);
      const totalFilledPositions = Number(row.TOTAL_FILLED_POSITIONS || row.total_filled_positions || 0);
      const totalVacantPositions = totalPositionsCount - totalFilledPositions;
      const fillRate = totalPositionsCount > 0 
        ? Number(((totalFilledPositions / totalPositionsCount) * 100).toFixed(2))
        : 0;

      return {
        total_positions: Number(row.TOTAL_POSITIONS || row.total_positions || 0),
        total_job_levels: Number(row.TOTAL_JOB_LEVELS || row.total_job_levels || 0),
        total_job_families: Number(row.TOTAL_JOB_FAMILIES || row.total_job_families || 0),
        total_grades: Number(row.TOTAL_GRADES || row.total_grades || 0),
        positions_stats: {
          total_positions: totalPositionsCount,
          filled_positions: totalFilledPositions,
          vacant_positions: totalVacantPositions,
          fill_rate: fillRate,
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch workforce structure stats: ${error.message}`);
    }
  }
}

export default WorkforceStatsModel;
