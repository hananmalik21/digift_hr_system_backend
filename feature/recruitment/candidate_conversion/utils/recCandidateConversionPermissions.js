import {
  REC_CANDIDATE_CONVERT_EMPLOYEE,
  REC_CANDIDATE_TRANSFER_TO_HR
} from './recCandidateConversionConstants.js';

/** FNDSEC function codes for conversion / Transfer to HR (enforce when REC_ENFORCE_PERMISSIONS=true). */
export const CANDIDATE_CONVERSION_PERMISSIONS = {
  validate: REC_CANDIDATE_CONVERT_EMPLOYEE,
  convert: REC_CANDIDATE_CONVERT_EMPLOYEE,
  transfer: REC_CANDIDATE_TRANSFER_TO_HR
};
