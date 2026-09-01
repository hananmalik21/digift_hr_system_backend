/**
 * Security module public interface.
 *
 * Other business modules MUST import from this facade instead of
 * security internals (user service, repositories).
 *
 * Future extraction: replace these implementations with HTTP calls
 * to the Security service without changing callers.
 */
export { hashPasswordArgon2id } from './users/service/fndsecUsersService.js';
export {
  provisionEnterpriseAdminOnEnterpriseCreate,
  ensureEnterpriseAdminUser
} from './users/service/enterpriseAdminProvisioningService.js';
