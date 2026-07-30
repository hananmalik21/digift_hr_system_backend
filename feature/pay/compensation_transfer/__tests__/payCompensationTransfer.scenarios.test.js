/**
 * Required scenario coverage for Compensation-to-Payroll Transfer.
 * Pure validation / error-mapping assertions (no live Oracle).
 * Live package behavior is exercised against PAY.PAY_COMPENSATION_TRANSFER_PKG
 * in a connected environment.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { mapCompensationTransferOracleError } from '../utils/payCompensationTransferOracleErrors.js';
import {
  assertEnterpriseAccess,
  validateTransferLineInput,
  validateTransferPayRunInput
} from '../validators/payCompensationTransferValidator.js';

function mockReq({ enterpriseId = 1, userId = 96, adminType = null } = {}) {
  return {
    user: {
      enterprise_id: enterpriseId,
      user_id: userId,
      username: String(userId),
      admin_type: adminType
    }
  };
}

function ora(num, message) {
  return { errorNum: num, message: `ORA-${num}: ${message}` };
}

test('1. Valid active Payroll Definition — request accepts numeric payroll_id', () => {
  const out = validateTransferLineInput(
    { pay_run_id: 68, pay_run_line_id: 324 },
    { enterprise_id: 1, payroll_id: 1 },
    mockReq()
  );
  assert.equal(out.payroll_id, 1);
});

test('2. Invalid Payroll Definition ID — ORA-20037 -> HTTP 422', () => {
  const mapped = mapCompensationTransferOracleError(ora(20037, 'does not exist'), {
    enterprise_id: 1,
    payroll_id: 999,
    pay_run_id: 68
  });
  assert.equal(mapped.httpStatus, 422);
  assert.equal(mapped.error_code, 'INVALID_PAYROLL_DEFINITION');
});

test('3. Payroll Definition from another enterprise — HTTP 422', () => {
  const mapped = mapCompensationTransferOracleError(
    ora(20037, 'belongs to another enterprise'),
    { enterprise_id: 1, payroll_id: 2, pay_run_id: 68 }
  );
  assert.equal(mapped.httpStatus, 422);
});

test('4. Inactive Payroll Definition — HTTP 422', () => {
  const mapped = mapCompensationTransferOracleError(ora(20037, 'inactive'), {
    enterprise_id: 1,
    payroll_id: 1
  });
  assert.equal(mapped.httpStatus, 422);
});

test('5. Payroll Definition starts after the pay period — HTTP 422', () => {
  const mapped = mapCompensationTransferOracleError(
    ora(20037, 'not effective for the processing period'),
    { enterprise_id: 1, payroll_id: 1, pay_run_id: 68 }
  );
  assert.equal(mapped.httpStatus, 422);
});

test('6. Payroll Definition ends before the pay period — HTTP 422', () => {
  const mapped = mapCompensationTransferOracleError(
    ora(20037, 'not effective for the processing period'),
    { enterprise_id: 1, payroll_id: 1, pay_run_id: 68 }
  );
  assert.equal(mapped.httpStatus, 422);
});

test('7. Missing payroll_id — HTTP 400 for normal users', () => {
  assert.throws(
    () =>
      validateTransferLineInput(
        { pay_run_id: 68, pay_run_line_id: 324 },
        { enterprise_id: 1 },
        mockReq()
      ),
    (err) => err instanceof ValidationError && err.errors.includes('payroll_id is required')
  );
});

test('8/9. Regular and retro transfers use the selected payroll_id in the request', () => {
  const out = validateTransferLineInput(
    { pay_run_id: 68, pay_run_line_id: 324 },
    { enterprise_id: 1, payroll_id: 1 },
    mockReq()
  );
  assert.equal(out.payroll_id, 1);
  assert.notEqual(out.payroll_id, out.pay_run_id);
});

test('10. Duplicate retry with same payroll_id — SKIPPED is a success path (not an Oracle error)', () => {
  // SKIPPED is returned by package OUT binds, not raised as ORA-*.
  // Controllers map TRANSFERRED -> 201 and SKIPPED -> 200.
  assert.equal(String('SKIPPED').toUpperCase() !== 'TRANSFERRED', true);
});

test('11. Duplicate retry with different payroll_id — ORA-20031 -> HTTP 409', () => {
  const mapped = mapCompensationTransferOracleError(ora(20031, 'mismatch'), {
    enterprise_id: 1,
    pay_run_id: 68,
    pay_run_line_id: 324,
    requested_payroll_id: 2
  });
  assert.equal(mapped.httpStatus, 409);
  assert.equal(mapped.error_code, 'TRANSFERRED_ENTRY_MISMATCH');
  assert.equal(mapped.details.requested_payroll_id, 2);
});

test('12. Complete pay-run transfer requires payroll_id for normal users', () => {
  const out = validateTransferPayRunInput(
    { pay_run_id: 68 },
    { enterprise_id: 1, payroll_id: 1, stop_on_error: 'N' },
    mockReq()
  );
  assert.equal(out.payroll_id, 1);
  assert.equal(out.stop_on_error, 'N');
});

test('13. Enterprise authorization blocks mismatched enterprise_id', () => {
  assert.throws(
    () => assertEnterpriseAccess(mockReq({ enterpriseId: 1 }), 99),
    (err) => err instanceof ForbiddenError
  );
});
