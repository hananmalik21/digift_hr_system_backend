/**
 * Process configuration group controllers.
 * Package: PAY.PAY_PROCESS_CONFIG_GROUPS_PKG
 */

import { createStatusGroupHandlers } from '../../shared/payrollStatusGroupHandlers.js';
import * as model from '../model/payProcessConfigGroupsModel.js';

export const {
  listGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  setGroupStatusHandler,
  deleteGroupHandler
} = createStatusGroupHandlers(model, {
  singular: 'Process configuration group',
  plural: 'Process configuration groups'
});
