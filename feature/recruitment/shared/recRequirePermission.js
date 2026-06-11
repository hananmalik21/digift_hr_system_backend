import { sendPackageResponse } from './recControllerHelpers.js';
import { bypassesFunctionPermissions } from '../../../utils/adminAccess.js';

/**
 * Optional permission gate. Set REC_ENFORCE_PERMISSIONS=true to require
 * `req.user.permissions` (string array) to include the function code.
 * Enterprise admins bypass this check.
 *
 * @param {string} permissionCode
 */
export function recRequirePermission(permissionCode) {
  return (req, res, next) => {
    if (process.env.REC_ENFORCE_PERMISSIONS !== 'true') {
      return next();
    }
    if (bypassesFunctionPermissions(req)) {
      return next();
    }
    const perms = req.user?.permissions;
    const list = Array.isArray(perms) ? perms.map((p) => String(p).trim()) : [];
    if (!list.includes(permissionCode)) {
      return sendPackageResponse(res, 403, {
        success: false,
        message: 'You do not have permission to perform this action.'
      });
    }
    return next();
  };
}
