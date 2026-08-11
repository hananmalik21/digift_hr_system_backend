import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  COMP_TRANSFER_ORACLE_ERROR_MAP,
  extractOracleErrorNum,
  mapCompensationTransferOracleError
} from '../utils/payCompensationTransferOracleErrors.js';

test('extractOracleErrorNum reads errorNum and ORA- message', () => {
  assert.equal(extractOracleErrorNum({ errorNum: 20037 }), 20037);
  assert.equal(
    extractOracleErrorNum({ message: 'ORA-20031: mismatch' }),
    20031
  );
});

test('ORA-20037 maps to HTTP 422 INVALID_PAYROLL_DEFINITION', () => {
  const mapped = mapCompensationTransferOracleError(
    { errorNum: 20037, message: 'ORA-20037: Payroll definition does not exist' },
    { enterprise_id: 1, payroll_id: 1, pay_run_id: 68 }
  );
  assert.equal(mapped.httpStatus, 422);
  assert.equal(mapped.error_code, 'INVALID_PAYROLL_DEFINITION');
  assert.equal(mapped.details.oracle_code, 'ORA-20037');
  assert.equal(mapped.details.payroll_id, 1);
});

test('ORA-20031 maps to HTTP 409 TRANSFERRED_ENTRY_MISMATCH', () => {
  const mapped = mapCompensationTransferOracleError(
    { errorNum: 20031, message: 'ORA-20031: entry mismatch' },
    { enterprise_id: 1, pay_run_id: 68, pay_run_line_id: 324, requested_payroll_id: 2 }
  );
  assert.equal(mapped.httpStatus, 409);
  assert.equal(mapped.error_code, 'TRANSFERRED_ENTRY_MISMATCH');
  assert.equal(mapped.details.requested_payroll_id, 2);
});

test('ORA-20021 / ORA-20022 map to HTTP 404', () => {
  assert.equal(
    mapCompensationTransferOracleError({ errorNum: 20021 }).httpStatus,
    404
  );
  assert.equal(
    mapCompensationTransferOracleError({ errorNum: 20022 }).httpStatus,
    404
  );
});

test('ORA-20001..20004 and ORA-20010 map to HTTP 400', () => {
  for (const code of [20001, 20002, 20003, 20004, 20010]) {
    assert.equal(
      mapCompensationTransferOracleError({ errorNum: code }).httpStatus,
      400,
      `expected ${code} -> 400`
    );
  }
});

test('ORA-20024..20026, 20028, 20032..20034, 20037 map to HTTP 422', () => {
  for (const code of [20024, 20025, 20026, 20028, 20032, 20033, 20034, 20037]) {
    assert.equal(
      mapCompensationTransferOracleError({ errorNum: code }).httpStatus,
      422,
      `expected ${code} -> 422`
    );
  }
});

test('ORA-20027, 20029..20031, 20035, 20036 map to HTTP 409', () => {
  for (const code of [20027, 20029, 20030, 20031, 20035, 20036]) {
    assert.equal(
      mapCompensationTransferOracleError({ errorNum: code }).httpStatus,
      409,
      `expected ${code} -> 409`
    );
  }
});

test('unrecognized Oracle errors map to HTTP 500', () => {
  const mapped = mapCompensationTransferOracleError({
    errorNum: 6550,
    message: 'ORA-06550: PLSQL error'
  });
  assert.equal(mapped.httpStatus, 500);
  assert.equal(mapped.error_code, 'DATABASE_ERROR');
});

test('DatabaseError central mapping recognizes ORA-20037', () => {
  const err = new DatabaseError('x', {
    errorNum: 20037,
    message: 'ORA-20037: Payroll definition does not exist'
  });
  assert.equal(err.statusCode, 422);
  assert.equal(err.code, 'INVALID_PAYROLL_DEFINITION');
});

test('DatabaseError central mapping recognizes ORA-20031', () => {
  const err = new DatabaseError('x', {
    errorNum: 20031,
    message: 'ORA-20031: mismatch'
  });
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'TRANSFERRED_ENTRY_MISMATCH');
});

test('COMP_TRANSFER_ORACLE_ERROR_MAP includes ORA-20037', () => {
  assert.equal(COMP_TRANSFER_ORACLE_ERROR_MAP[20037].errorCode, 'INVALID_PAYROLL_DEFINITION');
});
