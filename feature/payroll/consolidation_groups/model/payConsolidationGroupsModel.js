/**
 * Package: PAY.PAY_CONSOLIDATION_GROUPS_PKG
 */

import { createStatusGroupPackage } from '../../shared/payrollStatusGroupPackage.js';

export const PKG = 'PAY.PAY_CONSOLIDATION_GROUPS_PKG';

export const {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  setStatus,
  deleteGroup
} = createStatusGroupPackage({
  pkg: PKG,
  label: 'consolidation group'
});
