import PositionStatsModel from '../model/positionStatsModel.js';
import { createEnterpriseStatsRouter } from '../../../../utils/createEnterpriseStatsRouter.js';

export default createEnterpriseStatsRouter({
  getStats: (enterpriseId) => PositionStatsModel.getStats(enterpriseId),
  message: 'Position statistics retrieved successfully',
});
