/**
 * Controller helpers for Compensation-to-Payroll Transfer.
 */

import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import {
  GENERIC_ERROR_MESSAGE,
  HTTP,
  ROUTE_TAG,
  TRANSFER_STATUS
} from '../constants/payCompensationTransfer.constants.js';
import { mapCompensationTransferOracleError } from '../utils/payCompensationTransferOracleErrors.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage
} from '../validators/payCompensationTransferValidator.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

export function sendSuccess(res, { message, data, status = HTTP.OK }) {
  return res.status(status).json({
    success: true,
    message,
    data: data ?? {}
  });
}

export function sendError(res, { status, error_code, message, details = null }) {
  return res.status(status).json({
    success: false,
    error_code,
    message,
    details
  });
}

export function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? req.user?.user_id ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

export function buildErrorContext(validated = {}) {
  const context = { enterprise_id: validated.enterprise_id };
  if (validated.pay_run_id != null) context.pay_run_id = validated.pay_run_id;
  if (validated.pay_run_line_id != null) context.pay_run_line_id = validated.pay_run_line_id;
  if (validated.payroll_id != null) {
    context.payroll_id = validated.payroll_id;
    context.requested_payroll_id = validated.payroll_id;
  }
  return context;
}

function buildAuditExtra(context, result) {
  const extra = { ...context };
  if (result?.transfer_status) extra.transfer_status = result.transfer_status;
  if (result?.data?.transferred_count != null) {
    extra.transferred_count = result.data.transferred_count;
    extra.skipped_count = result.data.skipped_count;
    extra.failed_count = result.data.failed_count;
  }
  return extra;
}

function isMutationResult(result) {
  return result && typeof result === 'object' && 'data' in result && 'message' in result;
}

export async function withTransferErrorHandling(res, context, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, {
        status: HTTP.BAD_REQUEST,
        error_code: 'VALIDATION_ERROR',
        message: firstValidationMessage(err),
        details: Array.isArray(err?.errors) ? err.errors : null
      });
    }
    if (err instanceof ForbiddenError) {
      return sendError(res, {
        status: HTTP.FORBIDDEN,
        error_code: 'FORBIDDEN',
        message: err.message || 'Access denied'
      });
    }

    if (err instanceof DatabaseError || err?.transferError) {
      console.error(`[${ROUTE_TAG}]`, err?.oracleError?.message || err.message);
      const mapped =
        err.transferError ||
        mapCompensationTransferOracleError(err.oracleError || err, context);
      return sendError(res, {
        status: mapped.httpStatus || HTTP.INTERNAL,
        error_code: mapped.error_code,
        message: mapped.message,
        details: mapped.details || null
      });
    }

    console.error(`[${ROUTE_TAG}]`, err?.message || err);
    return sendError(res, {
      status: HTTP.INTERNAL,
      error_code: 'DATABASE_ERROR',
      message: GENERIC_ERROR_MESSAGE
    });
  }
}

/**
 * Shared handler scaffold: validate → enterprise check → work → respond.
 */
export function createTransferHandler({
  validate,
  action,
  successMessage,
  work,
  resolveStatus
}) {
  return asyncHandler(async (req, res) => {
    const context = {};
    return withTransferErrorHandling(res, context, async () => {
      const validated = validate(req);
      assertEnterpriseAccess(req, validated.enterprise_id);
      Object.assign(context, buildErrorContext(validated));

      const result = await work(validated);
      logAudit(action, req, buildAuditExtra(context, result));

      if (isMutationResult(result)) {
        return sendSuccess(res, {
          status: resolveStatus ? resolveStatus(result) : HTTP.OK,
          message: result.message || successMessage,
          data: result.data
        });
      }

      return sendSuccess(res, {
        message: successMessage,
        data: result
      });
    });
  });
}

export function resolveLineTransferHttpStatus(result) {
  return String(result.transfer_status || '').toUpperCase() === TRANSFER_STATUS.TRANSFERRED
    ? HTTP.CREATED
    : HTTP.OK;
}
