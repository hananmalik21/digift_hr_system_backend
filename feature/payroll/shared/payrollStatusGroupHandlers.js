/**
 * Shared REST handlers for named status-group packages.
 */

import { payrollHandler } from './payrollResponse.js';
import { createStatusGroupService } from './payrollStatusGroupService.js';
import {
  validateCreateGroup,
  validateDeleteGroup,
  validateGetGroup,
  validateListGroups,
  validateSetGroupStatus,
  validateUpdateGroup
} from './payrollStatusGroupValidation.js';

export function createStatusGroupHandlers(model, labels) {
  const service = createStatusGroupService(model, labels);
  return {
    listGroupsHandler: [validateListGroups, payrollHandler((req) => service.listGroups(req.validated))],
    getGroupHandler: [validateGetGroup, payrollHandler((req) => service.getGroup(req.validated))],
    createGroupHandler: [validateCreateGroup, payrollHandler((req) => service.createGroup(req.validated))],
    updateGroupHandler: [validateUpdateGroup, payrollHandler((req) => service.updateGroup(req.validated))],
    setGroupStatusHandler: [validateSetGroupStatus, payrollHandler((req) => service.setGroupStatus(req.validated))],
    deleteGroupHandler: [validateDeleteGroup, payrollHandler((req) => service.deleteGroup(req.validated))]
  };
}
