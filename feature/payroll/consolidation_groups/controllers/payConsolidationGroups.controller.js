/**
 * Consolidation group controllers.
 * Package: PAY.PAY_CONSOLIDATION_GROUPS_PKG
 */

import { createStatusGroupHandlers } from '../../shared/payrollStatusGroupHandlers.js';
import * as model from '../model/payConsolidationGroupsModel.js';

export const {
  listGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  setGroupStatusHandler,
  deleteGroupHandler
} = createStatusGroupHandlers(model, {
  singular: 'Consolidation group',
  plural: 'Consolidation groups'
});
