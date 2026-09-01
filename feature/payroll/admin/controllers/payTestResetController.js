/**
 * POST /api/payroll/admin/test-reset
 * Test/admin wrapper around PAY.PAYROLL_TEST_RESET_PKG.RESET_ENTERPRISE_RUNTIME.
 */

import { asyncHandler } from '@digifyhr/common';
import { ACTION } from '../constants.js';
import { validateTestReset } from '../middleware/payTestResetValidation.js';
import * as defaultPayTestResetService from '../services/payTestResetService.js';
import {
  PayrollTestResetError,
  extractOracleErrorNum,
  resetErrorEnvelope
} from '../utils/payTestResetErrors.js';

function countsFromResult(result) {
  const data = result?.data && typeof result.data === 'object' ? result.data : {};
  return {
    runs_reset: data.runs_reset ?? null,
    source_entries_reset: data.source_entries_reset ?? null,
    reusable_source_entries: data.reusable_source_entries ?? null
  };
}

function logResetAudit({ success, err, mapped, result, ...rest }) {
  const payload = {
    action: ACTION,
    enterprise_id: rest.enterprise_id,
    authenticated_user: rest.authenticated_user,
    request_time: rest.request_time,
    completion_time: new Date().toISOString(),
    success,
    ...countsFromResult(result),
    oracle_error_code: success ? null : (mapped?.oracleCode ?? extractOracleErrorNum(err) ?? null)
  };

  if (success) {
    console.info('[PAYROLL_TEST_RESET]', payload);
    return;
  }

  if (err instanceof PayrollTestResetError) {
    console.error('[PAYROLL_TEST_RESET]', {
      ...payload,
      oracle_message: mapped?.oracleMessage ?? null
    });
    return;
  }

  console.error('[PAYROLL_TEST_RESET] unexpected error:', err?.message || err, payload);
}

export function createTestResetHandler(service = defaultPayTestResetService) {
  return [
    validateTestReset,
    asyncHandler(async (req, res) => {
      const audit = {
        enterprise_id: req.validated.enterprise_id,
        authenticated_user: req.validated.actor,
        request_time: new Date().toISOString()
      };

      try {
        const result = await service.resetEnterpriseRuntime({
          enterpriseId: req.validated.enterprise_id,
          confirmation: req.validated.confirmation
        });
        logResetAudit({ ...audit, success: true, result });
        return res.status(200).json(result);
      } catch (err) {
        const mapped = err instanceof PayrollTestResetError ? err : new PayrollTestResetError();
        logResetAudit({ ...audit, success: false, err, mapped });
        return res.status(mapped.statusCode || 500).json(resetErrorEnvelope(mapped));
      }
    })
  ];
}

export const testResetHandler = createTestResetHandler();
