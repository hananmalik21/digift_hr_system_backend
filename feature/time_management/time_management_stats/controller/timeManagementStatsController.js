import TimeManagementStatsModel from '../model/timeManagementStatsModel.js';
import { createEnterpriseStatsRouter } from '../../../../utils/createEnterpriseStatsRouter.js';

export default createEnterpriseStatsRouter({
  getStats: (enterpriseId) => TimeManagementStatsModel.getStats(enterpriseId),
  message: 'Time management statistics retrieved successfully',
});
