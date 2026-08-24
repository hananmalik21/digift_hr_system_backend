import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import {
  buildListPaginationMeta,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import {
  APPLY_SUCCESS_MESSAGE,
  CHANGE_STAGE_SUCCESS_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  REJECT_ERROR_ALREADY_REJECTED,
  REJECT_ERROR_HIRED,
  REJECT_ERROR_NOT_FOUND,
  REJECT_ERROR_REASON_REQUIRED,
  REJECT_SUCCESS_MESSAGE,
  MUTATION_ERROR_MESSAGE,
  STAGE_HISTORY_LIST_SUCCESS_MESSAGE,
  NOTE_ADD_SUCCESS_MESSAGE,
  NOTE_DELETE_SUCCESS_MESSAGE,
  NOTE_UPDATE_SUCCESS_MESSAGE,
  NOTES_LIST_NOT_FOUND_MESSAGE,
  CANDIDATE_NOTES_LIST_NOT_FOUND_MESSAGE
} from './recApplicationConstants.js';

/**
 * @param {string} message
 * @returns {number}
 */
function packageMutationHttpStatus(message) {
  const m = String(message ?? '').trim().toLowerCase();
  if (m.includes('does not exist') || m.includes('not found')) return 404;
  return 400;
}

/**
 * @param {import('express').Response} res
 * @param {unknown[]} rows
 * @param {{ page: number, limit: number, total: number }} meta
 */
export function sendApplicationListResponse(res, rows, meta) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: LIST_SUCCESS_MESSAGE,
    meta: buildListPaginationMeta(meta.page, meta.limit, meta.total),
    data: rows
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} detail
 */
export function sendApplicationDetailResponse(res, detail) {
  return sendPackageResponse(res, 200, {
    success: true,
    data: detail
  });
}

/**
 * @param {import('express').Response} res
 * @param {unknown[]} rows
 * @param {{ page: number, limit: number, total: number }} meta
 */
export function sendStageHistoryListResponse(res, rows, meta) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: STAGE_HISTORY_LIST_SUCCESS_MESSAGE,
    meta: buildListPaginationMeta(meta.page, meta.limit, meta.total),
    data: rows
  });
}

/**
 * @param {import('express').Response} res
 */
export function sendApplicationNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: NOT_FOUND_MESSAGE
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} payload
 */
export function sendNotesListResponse(res, payload) {
  return sendPackageResponse(res, 200, {
    success: true,
    data: payload
  });
}

/** @param {import('express').Response} res @param {string} message */
export function sendNotesNotFoundResponse(res, message) {
  return sendPackageResponse(res, 404, {
    success: false,
    message
  });
}

export function sendApplicationNotesListResponse(res, payload) {
  return sendNotesListResponse(res, payload);
}

export function sendApplicationNotesNotFoundResponse(res) {
  return sendNotesNotFoundResponse(res, NOTES_LIST_NOT_FOUND_MESSAGE);
}

export function sendCandidateNotesListResponse(res, payload) {
  return sendNotesListResponse(res, payload);
}

export function sendCandidateNotesNotFoundResponse(res) {
  return sendNotesNotFoundResponse(res, CANDIDATE_NOTES_LIST_NOT_FOUND_MESSAGE);
}

/**
 * @param {import('express').Response} res
 * @param {{
 *   status?: string,
 *   message?: string,
 *   application_id?: number|null,
 *   application_guid?: string|null,
 *   application_number?: string|null
 * }} pkg
 */
export function sendApplyJobResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, 400, { success: false, message });
  }
  return sendPackageResponse(res, 200, {
    success: true,
    message: message || APPLY_SUCCESS_MESSAGE,
    data: {
      application_guid: pkg.application_guid ?? null,
      application_number: pkg.application_number ?? null
    }
  });
}

/** @param {import('express').Response} res @param {{ status?: string, message?: string }} pkg */
export function sendChangeStageResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, packageMutationHttpStatus(message), {
      success: false,
      message: message || MUTATION_ERROR_MESSAGE
    });
  }
  return sendPackageResponse(res, 200, {
    success: true,
    message: CHANGE_STAGE_SUCCESS_MESSAGE
  });
}

/**
 * @param {string} message
 * @returns {number}
 */
function rejectErrorHttpStatus(message) {
  const normalized = String(message ?? '').trim();
  if (
    normalized === REJECT_ERROR_NOT_FOUND ||
    normalized.toLowerCase().includes('does not exist')
  ) {
    return 404;
  }
  return 400;
}

/** @param {import('express').Response} res @param {{ status?: string, message?: string }} pkg */
export function sendRejectApplicationResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (success) {
    return sendPackageResponse(res, 200, {
      success: true,
      message: REJECT_SUCCESS_MESSAGE
    });
  }
  const displayMessage =
    message === REJECT_ERROR_NOT_FOUND ||
    message === REJECT_ERROR_ALREADY_REJECTED ||
    message === REJECT_ERROR_HIRED ||
    message === REJECT_ERROR_REASON_REQUIRED
      ? message
      : message || MUTATION_ERROR_MESSAGE;
  return sendPackageResponse(res, rejectErrorHttpStatus(displayMessage), {
    success: false,
    message: displayMessage
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, note_guid?: string|null }} pkg
 */
export function sendAddApplicationNoteResponse(res, pkg) {
  return sendApplicationMutationResponse(res, pkg, {
    successMessage: NOTE_ADD_SUCCESS_MESSAGE,
    data: { note_guid: pkg.note_guid ?? null }
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string }} pkg
 * @param {{ successMessage: string, data?: Record<string, unknown> }} opts
 */
function sendApplicationMutationResponse(res, pkg, opts) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, packageMutationHttpStatus(message), {
      success: false,
      message: message || MUTATION_ERROR_MESSAGE
    });
  }
  return sendPackageResponse(res, 200, {
    success: true,
    message: opts.successMessage,
    ...(opts.data ? { data: opts.data } : {})
  });
}

/** @param {import('express').Response} res @param {{ status?: string, message?: string }} pkg */
export function sendUpdateApplicationNoteResponse(res, pkg) {
  return sendApplicationMutationResponse(res, pkg, {
    successMessage: NOTE_UPDATE_SUCCESS_MESSAGE
  });
}

/** @param {import('express').Response} res @param {{ status?: string, message?: string }} pkg */
export function sendDeleteApplicationNoteResponse(res, pkg) {
  return sendApplicationMutationResponse(res, pkg, {
    successMessage: NOTE_DELETE_SUCCESS_MESSAGE
  });
}
