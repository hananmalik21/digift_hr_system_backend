import { AppError } from '../../../../utils/errors/index.js';
import {
  ACCEPTED_OFFER_NOT_FOUND_MESSAGE,
  CANDIDATE_NOT_FOUND_MESSAGE,
  ERROR_CODES,
  LOG_TAG,
  VALIDATE_SUCCESS_MESSAGE
} from '../utils/recCandidateConversionConstants.js';
import { createLoggedOp } from '../utils/recCandidateConversionLog.js';
import { mapConversionOracleError } from '../utils/recCandidateConversionOracleErrors.js';
import { mapConvertSuccessData } from '../utils/recCandidateConversionResponses.js';
import {
  convertToEmployeeViaPackage,
  resolveAcceptedOfferForCandidate,
  validateConversionViaPackage
} from '../model/recCandidateConversionModel.js';

const { log: logConversion, runLoggedOp } = createLoggedOp(LOG_TAG, mapConversionOracleError);

export function requireCandidateExists(resolved) {
  if (!resolved?.candidateExists) {
    throw new AppError(CANDIDATE_NOT_FOUND_MESSAGE, 404, ERROR_CODES.CANDIDATE_NOT_FOUND);
  }
}

/**
 * @param {{ candidateExists: boolean, offerGuid: string|null }} resolved
 * @returns {string}
 */
export function requireAcceptedOfferGuid(resolved) {
  requireCandidateExists(resolved);
  if (!resolved.offerGuid) {
    throw new AppError(
      ACCEPTED_OFFER_NOT_FOUND_MESSAGE,
      404,
      ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND
    );
  }
  return resolved.offerGuid;
}

/**
 * VALIDATE_CONVERSION — `can_convert=false` is a normal result, not a thrown error.
 *
 * @param {string} offerGuidHex
 * @param {string} actor
 */
export async function validateCandidateConversion(offerGuidHex, actor) {
  return runLoggedOp('VALIDATE_CONVERSION', { offer_guid: offerGuidHex, actor }, async () => {
    const pkg = await validateConversionViaPackage(offerGuidHex);
    return {
      result: {
        offer_guid: offerGuidHex,
        can_convert: pkg.can_convert,
        message: pkg.message || (pkg.can_convert ? VALIDATE_SUCCESS_MESSAGE : '')
      },
      extraLog: { can_convert: pkg.can_convert }
    };
  });
}

/**
 * CONVERT_TO_EMPLOYEE using OFFER_GUID. Package creates employee + assignment.
 *
 * @param {string} offerGuidHex
 * @param {string} actor
 * @param {number} probationDays
 * @param {{ candidate_guid?: string }} [extra]
 */
export async function convertCandidateToEmployee(offerGuidHex, actor, probationDays, extra = {}) {
  return runLoggedOp(
    'CONVERT_TO_EMPLOYEE',
    {
      offer_guid: offerGuidHex,
      candidate_guid: extra.candidate_guid ?? null,
      actor
    },
    async () => {
      const pkg = await convertToEmployeeViaPackage({
        offer_guid: offerGuidHex,
        actor,
        probation_days: probationDays
      });
      return {
        result: mapConvertSuccessData(offerGuidHex, pkg, extra),
        extraLog: {
          employee_id: pkg.employee_id,
          assignment_id: pkg.assignment_id
        }
      };
    }
  );
}

/**
 * Resolve latest ACCEPTED offer for a candidate, then convert via the package.
 *
 * @param {string} candidateGuidHex
 * @param {string} actor
 * @param {number} probationDays
 * @param {{
 *   resolveOffer?: (guid: string) => Promise<{ candidateExists: boolean, offerGuid: string|null }>,
 *   convert?: typeof convertCandidateToEmployee
 * }} [deps]
 */
export async function convertCandidateByCandidateGuid(
  candidateGuidHex,
  actor,
  probationDays,
  deps = {}
) {
  const resolveOffer = deps.resolveOffer ?? resolveAcceptedOfferForCandidate;
  const convert = deps.convert ?? convertCandidateToEmployee;
  const startedAt = Date.now();

  let offerGuid;
  try {
    offerGuid = requireAcceptedOfferGuid(await resolveOffer(candidateGuidHex));
  } catch (err) {
    const mapped = err instanceof AppError ? err : mapConversionOracleError(err);
    logConversion('CONVERT_TO_EMPLOYEE_BY_CANDIDATE', {
      candidate_guid: candidateGuidHex,
      actor,
      success: false,
      code: mapped.code,
      elapsed_ms: Date.now() - startedAt
    });
    throw mapped;
  }

  return convert(offerGuid, actor, probationDays, { candidate_guid: candidateGuidHex });
}
