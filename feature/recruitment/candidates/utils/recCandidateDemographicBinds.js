import {
  codeInBind,
  dateOnlyInBind,
  emailInBind,
  varcharInBind
} from '../../shared/oraclePackageUtils.js';

/**
 * Oracle IN binds for REC.CANDIDATE_PKG demographic parameters.
 * Expects body fields already normalized by validateCandidateDemographicFieldsInErrors.
 * @param {Record<string, unknown>} b
 */
export function buildCandidateDemographicInBinds(b) {
  return {
    p_date_of_birth: dateOnlyInBind(b.dob),
    p_gender: codeInBind(b.gender, 50),
    p_nationality: varcharInBind(b.nationality, 200),
    p_visa_status: varcharInBind(b.visa_status, 100),
    p_alternate_phone: varcharInBind(b.alternate_phone, 50),
    p_alternate_email: emailInBind(b.alternate_email, 320),
    p_preferred_location: varcharInBind(b.preferred_location, 500),
    p_source_from: varcharInBind(b.source_from, 500)
  };
}
