import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import { AppError } from '../../../../utils/errors/index.js';
import db from '../../../../config/db.js';
import {
  ACCEPTED_OFFER_NOT_FOUND_MESSAGE,
  CANDIDATE_NOT_FOUND_MESSAGE,
  ERROR_CODES,
  GENERIC_ERROR_MESSAGE,
  INVALID_CANDIDATE_GUID_MESSAGE,
  INVALID_OFFER_GUID_MESSAGE,
  INVALID_PROBATION_DAYS_MESSAGE
} from '../utils/recCandidateConversionConstants.js';
import {
  parseConversionCandidateGuid,
  parseConversionOfferGuid,
  parseProbationDays,
  ynToBoolean
} from '../utils/recCandidateConversionValidators.js';
import {
  cleanOracleBusinessMessage,
  mapConversionOracleError
} from '../utils/recCandidateConversionOracleErrors.js';
import {
  handleCandidateConversionError,
  mapConvertSuccessData,
  sendConvertSuccessResponse,
  sendValidateConversionResponse
} from '../utils/recCandidateConversionResponses.js';
import {
  CONVERT_PLSQL,
  LATEST_ACCEPTED_OFFER_SQL,
  VALIDATE_PLSQL,
  convertToEmployeeViaPackage
} from '../model/recCandidateConversionModel.js';
import {
  convertCandidateByCandidateGuid,
  requireAcceptedOfferGuid
} from '../service/recCandidateConversionService.js';

const OFFER_GUID = '5957CB3486193C3DE0631718000AA9C8';
const CANDIDATE_GUID = '5952FA7941222884E0631718000A4E04';
const EMPLOYEE_GUID = '5A7B9C9C49A83E0EE0631718000A8B11';
const ASSIGNMENT_GUID = '5A7B9C9C49A93E0EE0631718000A8B11';

const SUCCESS_PKG = {
  employee_id: 362,
  employee_guid: EMPLOYEE_GUID,
  employee_number: 'EMP-362',
  assignment_id: 460,
  assignment_guid: ASSIGNMENT_GUID
};

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function ora(message, errorNum = 20001) {
  return { errorNum, message };
}

function trackingConnection(executeImpl) {
  const calls = { commit: 0, rollback: 0, close: 0 };
  return {
    calls,
    connection: {
      execute: executeImpl,
      commit: async () => {
        calls.commit += 1;
      },
      rollback: async () => {
        calls.rollback += 1;
      },
      close: async () => {
        calls.close += 1;
      }
    }
  };
}

async function withMockConnection(connection, fn) {
  mock.method(db, 'getConnection', async () => connection);
  try {
    return await fn();
  } finally {
    mock.restoreAll();
  }
}

test('1. valid conversion maps nested employee and assignment', () => {
  const data = mapConvertSuccessData(OFFER_GUID, SUCCESS_PKG);
  assert.deepEqual(data.employee, {
    employee_id: 362,
    employee_guid: EMPLOYEE_GUID,
    employee_number: 'EMP-362'
  });
  assert.deepEqual(data.assignment, {
    assignment_id: 460,
    assignment_guid: ASSIGNMENT_GUID
  });
  assert.equal(data.conversion_status, 'COMPLETED');
  assert.equal(data.offer_guid, OFFER_GUID);
});

test('2. valid validation response is HTTP 200 with can_convert true', () => {
  const res = mockRes();
  sendValidateConversionResponse(res, {
    offer_guid: OFFER_GUID,
    can_convert: true,
    message: 'Candidate is eligible for employee conversion.'
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.can_convert, true);
  assert.equal(ynToBoolean('Y'), true);
  assert.equal(ynToBoolean('N'), false);
});

test('3. invalid offer GUID', () => {
  for (const value of ['', 'not-a-guid', CANDIDATE_GUID.slice(0, 8), `${OFFER_GUID}FF`]) {
    assert.throws(
      () => parseConversionOfferGuid(value),
      (err) =>
        err instanceof AppError &&
        err.statusCode === 400 &&
        err.code === ERROR_CODES.INVALID_OFFER_GUID &&
        err.message === INVALID_OFFER_GUID_MESSAGE
    );
  }
  assert.equal(parseConversionOfferGuid(OFFER_GUID.toLowerCase()), OFFER_GUID);
});

test('4. invalid candidate GUID', () => {
  assert.throws(
    () => parseConversionCandidateGuid('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
    (err) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.code === ERROR_CODES.INVALID_CANDIDATE_GUID &&
      err.message === INVALID_CANDIDATE_GUID_MESSAGE
  );
  assert.equal(parseConversionCandidateGuid(CANDIDATE_GUID.toLowerCase()), CANDIDATE_GUID);
});

test('5. candidate without accepted offer', async () => {
  assert.throws(
    () => requireAcceptedOfferGuid({ candidateExists: true, offerGuid: null }),
    (err) =>
      err.code === ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND &&
      err.message === ACCEPTED_OFFER_NOT_FOUND_MESSAGE
  );

  await assert.rejects(
    () =>
      convertCandidateByCandidateGuid(CANDIDATE_GUID, 'hr.user', 0, {
        resolveOffer: async () => ({ candidateExists: true, offerGuid: null }),
        convert: async () => {
          throw new Error('package must not be called');
        }
      }),
    (err) => err.code === ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND
  );
});

test('5b. candidate not found before offer lookup', async () => {
  assert.throws(
    () => requireAcceptedOfferGuid({ candidateExists: false, offerGuid: null }),
    (err) => err.code === ERROR_CODES.CANDIDATE_NOT_FOUND && err.message === CANDIDATE_NOT_FOUND_MESSAGE
  );

  await assert.rejects(
    () =>
      convertCandidateByCandidateGuid(CANDIDATE_GUID, 'hr.user', 0, {
        resolveOffer: async () => ({ candidateExists: false, offerGuid: null }),
        convert: async () => {
          throw new Error('must not convert');
        }
      }),
    (err) => err.code === ERROR_CODES.CANDIDATE_NOT_FOUND
  );
});

test('Oracle business errors map to the documented API codes', () => {
  const cases = [
    [
      '6. offer not accepted',
      'ORA-20001: Offer must be ACCEPTED before candidate conversion.\nORA-06512: at line 1',
      400,
      ERROR_CODES.OFFER_NOT_ACCEPTED,
      'Offer must be ACCEPTED before candidate conversion.'
    ],
    [
      '7. candidate already converted',
      'ORA-20001: This candidate has already been converted to an employee.',
      409,
      ERROR_CODES.CANDIDATE_ALREADY_CONVERTED,
      'This candidate has already been converted to an employee.'
    ],
    [
      '7b. offer already converted',
      'ORA-20001: This offer has already been converted to an employee.',
      409,
      ERROR_CODES.OFFER_ALREADY_CONVERTED,
      'This offer has already been converted to an employee.'
    ],
    [
      '8. duplicate employee email',
      'ORA-20001: Employee email already exists.',
      409,
      ERROR_CODES.EMPLOYEE_ALREADY_EXISTS,
      'Employee email already exists.'
    ],
    [
      '10. missing job family',
      'ORA-20001: Job family is not configured on the position.',
      400,
      ERROR_CODES.JOB_FAMILY_NOT_CONFIGURED,
      'Job family is not configured on the position.'
    ],
    [
      '11. missing job level',
      'ORA-20001: Job level is missing on the position.',
      400,
      ERROR_CODES.JOB_LEVEL_NOT_CONFIGURED,
      'Job level is missing on the position.'
    ],
    [
      '12. invalid manager',
      'ORA-20001: Reporting manager is invalid.',
      400,
      ERROR_CODES.INVALID_REPORTING_MANAGER,
      'Reporting manager is invalid.'
    ],
    [
      'invalid department',
      'ORA-20001: Invalid or inactive department.',
      400,
      ERROR_CODES.INVALID_DEPARTMENT,
      'Invalid or inactive department.'
    ],
    [
      'invalid position',
      'ORA-20001: Position is inactive.',
      400,
      ERROR_CODES.INVALID_POSITION,
      'Position is inactive.'
    ],
    [
      'grade missing',
      'ORA-20001: Grade is missing on the position.',
      400,
      ERROR_CODES.GRADE_NOT_CONFIGURED,
      'Grade is missing on the position.'
    ],
    [
      'assignment failure',
      'ORA-20001: Assignment could not be created.',
      400,
      ERROR_CODES.ASSIGNMENT_CREATION_FAILED,
      'Assignment could not be created.'
    ]
  ];

  for (const [label, message, statusCode, code, cleaned] of cases) {
    const err = mapConversionOracleError(ora(message));
    assert.equal(err.statusCode, statusCode, label);
    assert.equal(err.code, code, label);
    assert.equal(err.message, cleaned, label);
  }
});

test('9. invalid probation_days', () => {
  assert.equal(parseProbationDays(undefined), 0);
  assert.equal(parseProbationDays({}), 0);
  assert.equal(parseProbationDays({ probation_days: 90 }), 90);
  assert.equal(parseProbationDays({ probation_days: 0 }), 0);
  assert.throws(
    () => parseProbationDays({ probation_days: -10 }),
    (err) =>
      err.code === ERROR_CODES.INVALID_PROBATION_DAYS &&
      err.statusCode === 400 &&
      err.message === INVALID_PROBATION_DAYS_MESSAGE
  );
  assert.throws(() => parseProbationDays({ probation_days: 1.5 }), AppError);
  assert.throws(() => parseProbationDays({ probation_days: 'abc' }), AppError);
});

test('13. Oracle package failure hides stack and SQL', () => {
  const err = mapConversionOracleError({
    errorNum: 942,
    message: 'ORA-00942: table or view does not exist'
  });
  assert.equal(err.statusCode, 500);
  assert.equal(err.code, ERROR_CODES.CANDIDATE_CONVERSION_FAILED);
  assert.equal(err.message, GENERIC_ERROR_MESSAGE);
  assert.equal(
    cleanOracleBusinessMessage({
      message:
        'ORA-20001: This candidate has already been converted to an employee.\nORA-06512: at "REC.CANDIDATE_TO_EMPLOYEE_PKG", line 123'
    }),
    'This candidate has already been converted to an employee.'
  );
});

test('14. transaction rollback on package failure and always closes', async () => {
  const { calls, connection } = trackingConnection(async () => {
    throw ora('ORA-20001: Offer must be ACCEPTED before candidate conversion.');
  });
  await withMockConnection(connection, async () => {
    await assert.rejects(() =>
      convertToEmployeeViaPackage({
        offer_guid: OFFER_GUID,
        actor: 'hr.user',
        probation_days: 0
      })
    );
    assert.equal(calls.commit, 0);
    assert.equal(calls.rollback, 1);
    assert.equal(calls.close, 1);
  });
});

test('15. successful assignment outputs commit and return hex GUIDs', async () => {
  const { calls, connection } = trackingConnection(async (_sql, binds) => {
    assert.equal(binds.offer_guid.val, OFFER_GUID);
    assert.equal(binds.probation_days.val, 0);
    assert.equal(binds.actor.val, 'hr.user');
    assert.equal(binds.employee_guid.type, oracledb.BUFFER);
    assert.equal(binds.assignment_guid.type, oracledb.BUFFER);
    assert.equal(binds.employee_id.type, oracledb.NUMBER);
    assert.equal(binds.assignment_id.type, oracledb.NUMBER);
    return {
      outBinds: {
        employee_id: 362,
        employee_guid: Buffer.from(EMPLOYEE_GUID, 'hex'),
        employee_number: 'EMP-362',
        assignment_id: 460,
        assignment_guid: Buffer.from(ASSIGNMENT_GUID, 'hex')
      }
    };
  });

  await withMockConnection(connection, async () => {
    const out = await convertToEmployeeViaPackage({
      offer_guid: OFFER_GUID,
      actor: 'hr.user',
      probation_days: 0
    });
    assert.equal(out.employee_id, 362);
    assert.equal(out.employee_guid, EMPLOYEE_GUID);
    assert.equal(out.employee_number, 'EMP-362');
    assert.equal(out.assignment_id, 460);
    assert.equal(out.assignment_guid, ASSIGNMENT_GUID);
    assert.equal(Buffer.isBuffer(out.employee_guid), false);
    assert.equal(Buffer.isBuffer(out.assignment_guid), false);
    assert.equal(calls.commit, 1);
    assert.equal(calls.rollback, 0);
    assert.equal(calls.close, 1);
  });
});

test('package SQL uses HEXTORAW binds and assignment outputs', () => {
  assert.match(VALIDATE_PLSQL, /HEXTORAW\(:offer_guid\)/);
  assert.match(CONVERT_PLSQL, /p_probation_days\s+=>\s+:probation_days/);
  assert.match(CONVERT_PLSQL, /o_assignment_id\s+=>\s+:assignment_id/);
  assert.match(CONVERT_PLSQL, /o_assignment_guid\s+=>\s+:assignment_guid/);
  assert.doesNotMatch(CONVERT_PLSQL, /CREATE_EMPLOYEE_ALL_IN_ONE/);
  assert.match(LATEST_ACCEPTED_OFFER_SQL, /ORDER BY o\.OFFER_ID DESC/);
  assert.match(LATEST_ACCEPTED_OFFER_SQL, /HEXTORAW\(:candidate_guid\)/);
});

test('convert HTTP 201 includes nested employee and assignment', () => {
  const res = mockRes();
  sendConvertSuccessResponse(res, mapConvertSuccessData(OFFER_GUID, SUCCESS_PKG));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.employee.employee_id, 362);
  assert.equal(res.body.data.assignment.assignment_id, 460);
});

test('candidate convert uses latest accepted offer GUID for the package', async () => {
  let convertedOffer = null;
  const data = await convertCandidateByCandidateGuid(CANDIDATE_GUID, 'hr.user', 0, {
    resolveOffer: async () => ({ candidateExists: true, offerGuid: OFFER_GUID }),
    convert: async (offerGuid, actor, probationDays, extra) => {
      convertedOffer = offerGuid;
      assert.equal(actor, 'hr.user');
      assert.equal(probationDays, 0);
      assert.equal(extra.candidate_guid, CANDIDATE_GUID);
      return mapConvertSuccessData(offerGuid, SUCCESS_PKG, extra);
    }
  });
  assert.equal(convertedOffer, OFFER_GUID);
  assert.equal(data.candidate_guid, CANDIDATE_GUID);
  assert.equal(data.assignment.assignment_guid, ASSIGNMENT_GUID);
});

test('error handler returns mapped JSON without Oracle stacks', () => {
  const res = mockRes();
  handleCandidateConversionError(
    res,
    mapConversionOracleError(
      ora(
        'ORA-20001: This candidate has already been converted to an employee.\nORA-06512: at "REC.CANDIDATE_TO_EMPLOYEE_PKG", line 123'
      )
    )
  );
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    success: false,
    code: 'CANDIDATE_ALREADY_CONVERTED',
    message: 'This candidate has already been converted to an employee.'
  });
});
