// feature/enterprise_structure/active_structure_stats/model/activeStructureStatsModel.js
import { entInvokeWithConnection, toSnakeCaseDeep } from '../../shared/entDbClient.js';

class ActiveStructureStatsModel {
  /**
   * @param {number} enterpriseId
   */
  static async getActiveStructureStats(enterpriseId) {
    if (enterpriseId == null || enterpriseId === '' || isNaN(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
      throw new Error('enterprise_id is required and must be a positive number');
    }

    const { data } = await entInvokeWithConnection('STATS', 'GET_ACTIVE_STRUCTURE', {
      enterprise_id: Number(enterpriseId)
    });

    const payload = toSnakeCaseDeep(data) ?? {};
    const activeStructure = payload.active_structure ?? null;
    const levels = Array.isArray(payload.levels_with_components)
      ? payload.levels_with_components.map(toSnakeCaseDeep)
      : [];

    const keysToOmit = [
      'structure_type', 'description', 'is_active', 'created_by', 'created_date',
      'last_updated_by', 'last_updated_date', 'last_update_login', 'org_unit_count', 'employee_count'
    ];

    const slimStructure = activeStructure
      ? Object.fromEntries(Object.entries(activeStructure).filter(([k]) => !keysToOmit.includes(k)))
      : null;

    return {
      active_structure: slimStructure,
      levels_with_components: levels
    };
  }
}

export default ActiveStructureStatsModel;
