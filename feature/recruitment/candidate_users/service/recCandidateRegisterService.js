import { hashPasswordArgon2id } from '../../../security/security.facade.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { registerCandidateUserViaPackage } from '../model/recCandidateUserModel.js';
import { applyRegisterPortalDefaults } from '../utils/recCandidateRegisterDefaults.js';
import {
  REGISTER_GENERIC_ERROR,
  REGISTER_SUCCESS_MESSAGE
} from '../utils/recCandidatePortalConstants.js';

/**
 * @param {Record<string, unknown>} body Plain password in body.password (hashed here).
 */
export async function registerCandidateUserService(body) {
  const plainPassword = body.password;
  const payload = { ...body };
  applyRegisterPortalDefaults(payload);
  payload.password_hash = await hashPasswordArgon2id(plainPassword);
  delete payload.password;

  const pkg = await registerCandidateUserViaPackage(payload);

  if (packageStatusIsSuccess(pkg.status)) {
    return {
      httpStatus: 200,
      payload: {
        success: true,
        message: pkg.message || REGISTER_SUCCESS_MESSAGE,
        candidate_id: pkg.candidate_id ?? null,
        candidate_guid: pkg.candidate_guid ?? null,
        candidate_user_id: pkg.candidate_user_id ?? null,
        candidate_user_guid: pkg.candidate_user_guid ?? null
      }
    };
  }

  const message = /ORA-\d+/i.test(pkg.message ?? '') ? REGISTER_GENERIC_ERROR : pkg.message || REGISTER_GENERIC_ERROR;
  return {
    httpStatus: 400,
    payload: { success: false, message }
  };
}
