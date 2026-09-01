/**
 * GitHub Enterprise Structure package adapter.
 *
 * Prefix-safe routes and catch-alls are mounted separately so
 * `/api/:structureId` cannot steal Time / Security / Recruitment paths.
 */
import {
  initEnterprisePackage as initPkg,
  closeEnterprisePackage as closePkg,
  mountEnterprisePackage as mountPkg,
  mountEnterpriseCatchAllRoutes as mountCatchAll,
  enterpriseFacade
} from 'digify-hr-enterprise-backend';
import { provisionEnterpriseAdminOnEnterpriseCreate } from '../security/security.facade.js';

export function mountEnterprisePackage(app) {
  if (app == null || typeof app.use !== 'function') {
    throw new Error('mountEnterprisePackage requires an Express app');
  }
  mountPkg(app);
}

export function mountEnterpriseCatchAllRoutes(app) {
  if (app == null || typeof app.use !== 'function') {
    throw new Error('mountEnterpriseCatchAllRoutes requires an Express app');
  }
  mountCatchAll(app);
}

export async function initEnterprisePackage(options = {}) {
  return initPkg({
    onEnterpriseProvisioned: provisionEnterpriseAdminOnEnterpriseCreate,
    ...options
  });
}

export async function closeEnterprisePackage() {
  return closePkg();
}

export { enterpriseFacade };
