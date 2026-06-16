// feature/enterprise_structure/enterprise_stats/model/enterpriseStatsModel.js
import { entInvokeWithConnection, toSnakeCaseDeep } from '../../shared/entDbClient.js';

class EnterpriseStatsModel {
  /**
   * @param {number} enterpriseId
   */
  static async getStats(enterpriseId) {
    if (enterpriseId == null || enterpriseId === '' || isNaN(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
      throw new Error('enterprise_id is required and must be a positive number');
    }

    const { data } = await entInvokeWithConnection('STATS', 'GET_ENTERPRISE', {
      enterprise_id: Number(enterpriseId)
    });

    const row = toSnakeCaseDeep(data) ?? {};
    const getNum = (val) => Number(val ?? 0) || 0;

    return {
      total_structures: getNum(row.total_structures),
      active_structures: getNum(row.active_structures),
      components_in_use: getNum(row.components_in_use),
      employees_assigned: getNum(row.employees_assigned)
    };
  }
}

export default EnterpriseStatsModel;
