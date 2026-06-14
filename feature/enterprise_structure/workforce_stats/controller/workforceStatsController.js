import WorkforceStatsModel from '../model/workforceStatsModel.js';
import { createEnterpriseStatsRouter } from '../../../../utils/createEnterpriseStatsRouter.js';

export default createEnterpriseStatsRouter({
  getStats: (enterpriseId) => WorkforceStatsModel.getStats(enterpriseId),
  message: 'Workforce structure statistics retrieved successfully',
});
