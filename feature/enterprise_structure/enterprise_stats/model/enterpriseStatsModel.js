// feature/enterprise_structure/enterprise_stats/model/enterpriseStatsModel.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * Enterprise stats model – aggregates for an enterprise/tenant:
 * - Total structures (ENT.HR_ORG_STRUCTURES)
 * - Active structure count (IS_ACTIVE = 'Y')
 * - Components in use (org units under that enterprise's structures)
 * - Employees assigned (distinct employees in assignments via those org units)
 */
class EnterpriseStatsModel {
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
    return result;
  }

  /**
   * Get enterprise statistics for an enterprise/tenant.
   * @param {number} enterpriseId - Enterprise (tenant) ID
   * @returns {Promise<{ total_structures: number, active_structures: number, components_in_use: number, employees_assigned: number }>}
   */
  static async getStats(enterpriseId) {
    if (enterpriseId == null || enterpriseId === '' || isNaN(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
      throw new Error('enterprise_id is required and must be a positive number');
    }
    const eid = Number(enterpriseId);

    const sql = `
      SELECT
        (SELECT COUNT(*)
         FROM ENT.HR_ORG_STRUCTURES
         WHERE ENTERPRISE_ID = :1) AS TOTAL_STRUCTURES,
        (SELECT COUNT(*)
         FROM ENT.HR_ORG_STRUCTURES
         WHERE ENTERPRISE_ID = :1 AND IS_ACTIVE = 'Y') AS ACTIVE_STRUCTURES,
        (SELECT COUNT(*)
         FROM ENT.ORG_UNITS ou
         INNER JOIN ENT.HR_ORG_STRUCTURES s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
         WHERE s.ENTERPRISE_ID = :1) AS COMPONENTS_IN_USE,
        (SELECT COUNT(DISTINCT a.EMPLOYEE_ID)
         FROM EMPL.ASSIGNMENTS a
         INNER JOIN ENT.ORG_UNITS ou ON ou.ORG_UNIT_ID = a.ORG_UNIT_ID
         INNER JOIN ENT.HR_ORG_STRUCTURES s ON s.STRUCTURE_ID = ou.ORG_STRUCTURE_ID
         WHERE s.ENTERPRISE_ID = :1) AS EMPLOYEES_ASSIGNED
      FROM DUAL
    `;

    const result = await this.executeQuery(sql, [eid]);
    const row = result.rows?.[0] || {};

    const getNum = (val) => Number(val ?? 0) || 0;

    return {
      total_structures: getNum(row.TOTAL_STRUCTURES),
      active_structures: getNum(row.ACTIVE_STRUCTURES),
      components_in_use: getNum(row.COMPONENTS_IN_USE),
      employees_assigned: getNum(row.EMPLOYEES_ASSIGNED),
    };
  }
}

export default EnterpriseStatsModel;
