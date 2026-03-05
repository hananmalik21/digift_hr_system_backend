// feature/enterprise_structure/active_structure_stats/model/activeStructureStatsModel.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';

/**
 * Active structure stats model – stats for the active structure (IS_ACTIVE='Y') of an enterprise:
 * - Active structure details
 * - Hierarchy levels with component (org unit) count per level
 */
class ActiveStructureStatsModel {
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
    return result;
  }

  /**
   * Fetch hierarchy levels for a structure with component (org unit) count per level.
   * @param {string} structureIdHex - 32-char hex structure ID
   * @returns {Promise<Array<{ level_id, level_code, level_name, level_number, display_order, component_count }>>}
   */
  static async getLevelsWithComponentCounts(structureIdHex) {
    if (!structureIdHex || typeof structureIdHex !== 'string') return [];
    const sql = `
      SELECT
        h.LEVEL_ID,
        h.LEVEL_CODE,
        h.LEVEL_NAME,
        h.LEVEL_NUMBER,
        h.DISPLAY_ORDER,
        (SELECT COUNT(*)
         FROM ENT.ORG_UNITS ou
         WHERE ou.ORG_STRUCTURE_ID = HEXTORAW(:1)
           AND UPPER(NVL(ou.LEVEL_CODE, ' ')) = UPPER(NVL(h.LEVEL_CODE, ' '))) AS COMPONENT_COUNT
      FROM ENT.HR_ORG_HIERARCHY_LEVELS h
      WHERE h.STRUCTURE_ID = HEXTORAW(:1)
        AND h.IS_ACTIVE = 'Y'
      ORDER BY h.DISPLAY_ORDER, h.LEVEL_NUMBER
    `;
    const result = await this.executeQuery(sql, [structureIdHex.trim().toUpperCase()]);
    const rows = result.rows || [];
    return rows.map((r) => ({
      level_id: r.LEVEL_ID,
      level_code: r.LEVEL_CODE,
      level_name: r.LEVEL_NAME,
      level_number: r.LEVEL_NUMBER,
      display_order: r.DISPLAY_ORDER,
      component_count: Number(r.COMPONENT_COUNT ?? 0) || 0,
    }));
  }

  /**
   * Get active structure stats for an enterprise/tenant: active structure and its levels with component counts.
   * @param {number} enterpriseId - Enterprise (tenant) ID
   * @returns {Promise<{
   *   active_structure: object|null,
   *   levels_with_components: Array<{ level_id, level_code, level_name, level_number, display_order, component_count }>
   * }>}
   */
  static async getActiveStructureStats(enterpriseId) {
    if (enterpriseId == null || enterpriseId === '' || isNaN(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
      throw new Error('enterprise_id is required and must be a positive number');
    }
    const eid = Number(enterpriseId);

    const activeStructure = await HrOrgStructureModel.findActive(eid);
    let levels_with_components = [];
    if (activeStructure && activeStructure.structure_id) {
      levels_with_components = await this.getLevelsWithComponentCounts(activeStructure.structure_id);
    }

    const keysToOmit = [
      'structure_type', 'description', 'is_active', 'created_by', 'created_date',
      'last_updated_by', 'last_updated_date', 'last_update_login', 'org_unit_count', 'employee_count',
    ];
    const slimStructure = activeStructure
      ? Object.fromEntries(Object.entries(activeStructure).filter(([k]) => !keysToOmit.includes(k)))
      : null;

    return {
      active_structure: slimStructure,
      levels_with_components,
    };
  }
}

export default ActiveStructureStatsModel;
