/**
 * Payroll test/admin runtime reset — wraps PAY.PAYROLL_TEST_RESET_PKG.
 * Destructive. Disabled in production. Not a normal payroll business endpoint.
 */

export const PKG = 'PAY.PAYROLL_TEST_RESET_PKG';
export const RESET_PROCEDURE = 'RESET_ENTERPRISE_RUNTIME';

export const CONFIRMATION_CODE = 'RESET_PAYROLL_TEST_DATA';

export const ACTION = 'PAYROLL_TEST_RESET';
export const ERROR_CODE = 'PAYROLL_TEST_RESET_FAILED';
export const FAILED_MESSAGE = 'Payroll runtime reset failed.';
export const PRODUCTION_DISABLED_MESSAGE = 'Payroll test reset is disabled in production.';
export const ADMIN_REQUIRED_MESSAGE =
  'Access denied. Enterprise administrator privileges are required.';
export const ENTERPRISE_ACCESS_DENIED_MESSAGE = 'Enterprise access denied';

/** RAISE_APPLICATION_ERROR codes used by the package for confirmation/FK/safety blockers. */
export const RESET_BUSINESS_ORACLE_CODES = Object.freeze([
  20980, 20981, 20991, 20992, 20993, 20994, 20995, 20996, 20997, 20998
]);

export const RESET_BUSINESS_ORACLE_CODE_SET = new Set(RESET_BUSINESS_ORACLE_CODES);

/**
 * True when NODE_ENV or APP_ENV is production. Evaluated at call time so tests
 * can toggle the flag without reloading this module.
 */
export function isPayrollTestResetDisabled() {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  const appEnv = String(process.env.APP_ENV || '').trim().toLowerCase();
  return nodeEnv === 'production' || appEnv === 'production';
}

export const RESET_ENTERPRISE_RUNTIME_PLSQL = `
BEGIN
    ${PKG}.${RESET_PROCEDURE}(
        P_ENTERPRISE_ID => :enterprise_id,
        P_CONFIRM_CODE  => :confirmation,
        O_RESULT_JSON   => :result_json
    );
END;`.trim();
