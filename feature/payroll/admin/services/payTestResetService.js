/**
 * Payroll test/admin runtime reset.
 * Oracle package PAY.PAYROLL_TEST_RESET_PKG is the sole owner of reset DML/COMMIT.
 * This service only calls RESET_ENTERPRISE_RUNTIME and parses O_RESULT_JSON.
 */

import {
  executePayrollPackage,
  numberBind,
  outClob,
  stringBind
} from '../../shared/index.js';
import { RESET_ENTERPRISE_RUNTIME_PLSQL } from '../constants.js';
import { PayrollTestResetError, mapResetOracleError } from '../utils/payTestResetErrors.js';

/**
 * @param {{ enterpriseId: number, confirmation: string }} input
 * @param {{ executePayrollPackage?: typeof executePayrollPackage }} [deps]
 * @returns {Promise<object>} Parsed package JSON
 */
export async function resetEnterpriseRuntime(input, deps = {}) {
  const execute = deps.executePayrollPackage ?? executePayrollPackage;

  try {
    const outcome = await execute(
      RESET_ENTERPRISE_RUNTIME_PLSQL,
      {
        enterprise_id: numberBind(input.enterpriseId),
        confirmation: stringBind(input.confirmation, 100),
        ...outClob('result_json')
      },
      {
        autoCommit: false,
        genericError: 'Payroll runtime reset failed.',
        mapOut: async (_out, helpers) => helpers.parseJsonClob('result_json')
      }
    );

    const parsed = normalizePackageJson(outcome?.data);
    if (!parsed) {
      console.error('[PAYROLL_TEST_RESET] package returned invalid JSON', {
        enterprise_id: input.enterpriseId
      });
      throw new PayrollTestResetError();
    }
    return parsed;
  } catch (err) {
    throw mapResetOracleError(err);
  }
}

function normalizePackageJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
