import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import oracledb from 'oracledb';
import { AppError } from '../../../../utils/errors/index.js';
import db from '../../../../config/db.js';
import {
  ACCEPTED_OFFER_NOT_FOUND_MESSAGE,
  ERROR_CODES,
  GENERIC_TRANSFER_ERROR_MESSAGE,
  HR_CONTACT_REQUIRED_MESSAGE,
  INVALID_CANDIDATE_GUID_MESSAGE,
  INVALID_PROBATION_DAYS_MESSAGE,
  TRANSFER_SUCCESS_MESSAGE,
  TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE
} from '../utils/recCandidateConversionConstants.js';
import {
  booleanToYn,
  parseConversionCandidateGuid,
  parseProbationDays,
  parseTransferToHrBody
} from '../utils/recCandidateConversionValidators.js';
import { mapTransferOracleError } from '../utils/recCandidateConversionOracleErrors.js';
import {
  mapTransferSuccessData,
  sendTransferDetailsResponse,
  sendTransferSuccessResponse,
  transferSuccessMessage
} from '../utils/recCandidateConversionResponses.js';
import {
  TRANSFER_PLSQL,
  TRANSFER_HISTORY_SQL,
  UPDATE_TRANSFER_ACTION_PLSQL,
  transferToHrViaPackage,
  updateTransferActionStatusViaPackage
} from '../model/recCandidateConversionModel.js';
import { requireAcceptedOfferGuid } from '../service/recCandidateConversionService.js';
import {
  getCandidateTransferHistory,
  getTransferToHrDetails,
  transferCandidateToHr
} from '../service/recCandidateTransferService.js';
import {
  listConfiguredHrContacts,
  resolveHrContactEmail
} from '../utils/recCandidateTransferHrContacts.js';

const OFFER_GUID = '5957CB3486193C3DE0631718000AA9C8';
const CANDIDATE_GUID = '5952FA7941222884E0631718000A4E04';
const EMPLOYEE_GUID = '5A7B9C9C49A83E0EE0631718000A8B11';
const ASSIGNMENT_GUID = '5A7B9C9C49A93E0EE0631718000A8B11';
const TRANSFER_GUID = '5A7B9C9C49AA3E0EE0631718000A8B11';

const SUCCESS_PKG = {
  employee_id: 362,
  employee_guid: EMPLOYEE_GUID,
  employee_number: 'EMP-362',
  assignment_id: 460,
  assignment_guid: ASSIGNMENT_GUID,
  transfer_id: 101,
  transfer_guid: TRANSFER_GUID
};

const CONTEXT = {
  candidateExists: true,
  offerGuid: OFFER_GUID,
  candidateName: 'Candidate Name',
  offer: {
    offer_id: 27,
    offer_number: 'OFF-20260818-00022',
    job_title: 'LangChain Ai Developer',
    start_date: '2026-08-18',
    employment_type: 'PERMANENT'
  }
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

function validTransferBody(overrides = {}) {
  return parseTransferToHrBody({
    probation_days: 90,
    hr_contact_id: 'HR_TEAM_001',
    transfer_notes: 'Please prioritize onboarding.',
    send_notification: true,
    trigger_onboarding: true,
    ...overrides
  });
}

test('1. transfer details load candidate, offer, validation, and defaults', async () => {
  const data = await getTransferToHrDetails(CANDIDATE_GUID, 'hr.user', {
    getContext: async () => CONTEXT,
    validate: async (offerGuid) => {
      assert.equal(offerGuid, OFFER_GUID);
      return { can_convert: true, message: 'Candidate is eligible for employee conversion.' };
    },
    listHrContacts: () => []
  });

  assert.equal(data.candidate_guid, CANDIDATE_GUID);
  assert.equal(data.offer_guid, OFFER_GUID);
  assert.equal(data.candidate.name, 'Candidate Name');
  assert.equal(data.offer.job_title, 'LangChain Ai Developer');
  assert.equal(data.offer.start_date, '2026-08-18');
  assert.equal(data.validation.can_transfer, true);
  assert.equal(data.defaults.probation_days, 0);
  assert.equal(data.defaults.send_notification, true);
  assert.equal(data.defaults.trigger_onboarding, true);
  assert.deepEqual(data.hr_contacts, []);
  assert.equal(data.note, 'Employee and initial assignment will be created in HR.');

  const res = mockRes();
  sendTransferDetailsResponse(res, data);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('2. valid transfer maps employee, assignment, and transfer output', async () => {
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody(),
    {
      getContext: async () => CONTEXT,
      transfer: async (params) => {
        assert.equal(params.offer_guid, OFFER_GUID);
        assert.equal(params.probation_days, 90);
        assert.equal(params.hr_contact_id, 'HR_TEAM_001');
        assert.equal(params.send_notification, true);
        assert.equal(params.trigger_onboarding, true);
        assert.equal(params.actor, 'hr.user');
        return SUCCESS_PKG;
      },
      sendNotification: async () => ({ success: true }),
      triggerOnboarding: async () => ({ success: true, reference: 'ONB-101' }),
      updateStatus: async () => {}
    }
  );

  assert.equal(result.message, TRANSFER_SUCCESS_MESSAGE);
  assert.deepEqual(result.data.employee, {
    employee_id: 362,
    employee_guid: EMPLOYEE_GUID,
    employee_number: 'EMP-362'
  });
  assert.deepEqual(result.data.assignment, {
    assignment_id: 460,
    assignment_guid: ASSIGNMENT_GUID
  });
  assert.equal(result.data.transfer.transfer_id, 101);
  assert.equal(result.data.transfer.transfer_guid, TRANSFER_GUID);
  assert.equal(result.data.transfer.status, 'COMPLETED');
  assert.deepEqual(result.data.transfer.notification, { requested: true, status: 'SENT' });
  assert.deepEqual(result.data.transfer.onboarding, {
    requested: true,
    status: 'TRIGGERED',
    reference: 'ONB-101'
  });
});

test('3. invalid candidate GUID', () => {
  assert.throws(
    () => parseConversionCandidateGuid('not-a-guid'),
    (err) =>
      err instanceof AppError &&
      err.statusCode === 400 &&
      err.code === ERROR_CODES.INVALID_CANDIDATE_GUID &&
      err.message === INVALID_CANDIDATE_GUID_MESSAGE
  );
});

test('4. no accepted offer', async () => {
  await assert.rejects(
    () =>
      transferCandidateToHr(CANDIDATE_GUID, 'hr.user', validTransferBody(), {
        getContext: async () => ({ candidateExists: true, offerGuid: null, offer: null }),
        transfer: async () => {
          throw new Error('package must not be called');
        }
      }),
    (err) =>
      err.code === ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND &&
      err.message === ACCEPTED_OFFER_NOT_FOUND_MESSAGE
  );
  assert.throws(
    () => requireAcceptedOfferGuid({ candidateExists: true, offerGuid: null }),
    (err) => err.code === ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND
  );
});

test('5. already transferred offer', () => {
  const err = mapTransferOracleError(
    ora('ORA-20001: This offer has already been transferred to HR.')
  );
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, ERROR_CODES.OFFER_ALREADY_TRANSFERRED);
  assert.equal(err.message, 'This offer has already been transferred to HR.');
});

test('6. already converted candidate', () => {
  const err = mapTransferOracleError(
    ora('ORA-20001: This candidate has already been converted to an employee.')
  );
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, ERROR_CODES.CANDIDATE_ALREADY_CONVERTED);
});

test('7. invalid probation days', () => {
  assert.throws(
    () => parseTransferToHrBody({ probation_days: -1, send_notification: false }),
    (err) =>
      err.code === ERROR_CODES.INVALID_PROBATION_DAYS &&
      err.message === INVALID_PROBATION_DAYS_MESSAGE
  );
  assert.equal(parseProbationDays({ probation_days: 90 }), 90);
});

test('8. notification required without HR contact', () => {
  assert.throws(
    () => parseTransferToHrBody({ send_notification: true }),
    (err) =>
      err.statusCode === 400 &&
      err.code === ERROR_CODES.HR_CONTACT_REQUIRED &&
      err.message === HR_CONTACT_REQUIRED_MESSAGE
  );
  const skipped = parseTransferToHrBody({ send_notification: false });
  assert.equal(skipped.hr_contact_id, null);
  assert.equal(skipped.send_notification, false);
});

test('9-11. successful employee, assignment, and transfer HTTP 201', () => {
  const data = mapTransferSuccessData(CANDIDATE_GUID, OFFER_GUID, SUCCESS_PKG, {
    send_notification: true,
    trigger_onboarding: true,
    notification_status: 'SENT',
    onboarding_status: 'TRIGGERED',
    onboarding_reference: 'ONB-101'
  });
  const res = mockRes();
  sendTransferSuccessResponse(res, data);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.employee.employee_id, 362);
  assert.equal(res.body.data.assignment.assignment_id, 460);
  assert.equal(res.body.data.transfer.transfer_id, 101);
  assert.equal(res.body.data.transfer.transfer_guid, TRANSFER_GUID);
});

test('12. email success updates SENT without failing transfer', async () => {
  const statusCalls = [];
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody({ trigger_onboarding: false }),
    {
      getContext: async () => CONTEXT,
      transfer: async () => SUCCESS_PKG,
      sendNotification: async () => ({ success: true }),
      triggerOnboarding: async () => {
        throw new Error('onboarding must not run');
      },
      updateStatus: async (params) => {
        statusCalls.push(params);
      }
    }
  );
  assert.equal(result.data.transfer.notification.status, 'SENT');
  assert.equal(statusCalls[0].notification_status, 'SENT');
  assert.equal(result.message, TRANSFER_SUCCESS_MESSAGE);
});

test('13. email failure after transfer still returns success', async () => {
  const statusCalls = [];
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody({ trigger_onboarding: false }),
    {
      getContext: async () => CONTEXT,
      transfer: async () => SUCCESS_PKG,
      sendNotification: async () => ({ success: false, error: 'SMTP timeout' }),
      updateStatus: async (params) => {
        statusCalls.push(params);
      }
    }
  );
  assert.equal(result.message, TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE);
  assert.equal(result.data.transfer.status, 'COMPLETED');
  assert.deepEqual(result.data.transfer.notification, { requested: true, status: 'FAILED' });
  assert.equal(statusCalls[0].notification_status, 'FAILED');
  assert.equal(statusCalls[0].notification_message, 'SMTP timeout');
});

test('14. onboarding success updates TRIGGERED', async () => {
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody({ send_notification: false, hr_contact_id: null }),
    {
      getContext: async () => CONTEXT,
      transfer: async () => SUCCESS_PKG,
      sendNotification: async () => {
        throw new Error('email must not run');
      },
      triggerOnboarding: async (payload) => {
        assert.equal(payload.employee_id, 362);
        return { success: true, reference: 'WF-9' };
      },
      updateStatus: async () => {}
    }
  );
  assert.equal(result.data.transfer.onboarding.status, 'TRIGGERED');
  assert.equal(result.data.transfer.onboarding.reference, 'WF-9');
});

test('15. onboarding failure after transfer still returns success', async () => {
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody({ send_notification: false, hr_contact_id: null }),
    {
      getContext: async () => CONTEXT,
      transfer: async () => SUCCESS_PKG,
      triggerOnboarding: async () => ({ success: false, error: 'workflow down' }),
      updateStatus: async () => {}
    }
  );
  assert.equal(result.data.transfer.status, 'COMPLETED');
  assert.equal(result.data.transfer.onboarding.status, 'FAILED');
  assert.match(result.message, /onboarding could not be triggered/);
});

test('16. rollback when TRANSFER_TO_HR fails', async () => {
  const { calls, connection } = trackingConnection(async () => {
    throw ora('ORA-20001: This offer has already been transferred to HR.');
  });
  await withMockConnection(connection, async () => {
    await assert.rejects(() =>
      transferToHrViaPackage({
        offer_guid: OFFER_GUID,
        actor: 'hr.user',
        probation_days: 90,
        hr_contact_id: 'HR_TEAM_001',
        transfer_notes: null,
        send_notification: true,
        trigger_onboarding: true
      })
    );
    assert.equal(calls.commit, 0);
    assert.equal(calls.rollback, 1);
    assert.equal(calls.close, 1);
  });
});

test('17. no rollback for post-commit email failure', async () => {
  let transferCommitted = false;
  const result = await transferCandidateToHr(
    CANDIDATE_GUID,
    'hr.user',
    validTransferBody({ trigger_onboarding: false }),
    {
      getContext: async () => CONTEXT,
      transfer: async () => {
        transferCommitted = true;
        return SUCCESS_PKG;
      },
      sendNotification: async () => {
        assert.equal(transferCommitted, true);
        return { success: false, error: 'mailbox full' };
      },
      updateStatus: async () => {}
    }
  );
  assert.equal(result.data.transfer.status, 'COMPLETED');
  assert.equal(result.data.transfer.notification.status, 'FAILED');
});

test('18. RAW GUID conversion and Y/N CHAR binds', async () => {
  const { calls, connection } = trackingConnection(async (_sql, binds) => {
    assert.equal(binds.offer_guid.val, OFFER_GUID);
    assert.equal(binds.send_notification_flag.val, 'Y');
    assert.equal(binds.trigger_onboarding_flag.val, 'N');
    assert.equal(binds.send_notification_flag.maxSize, 1);
    assert.equal(binds.employee_guid.type, oracledb.BUFFER);
    assert.equal(binds.transfer_guid.type, oracledb.BUFFER);
    return {
      outBinds: {
        employee_id: 362,
        employee_guid: Buffer.from(EMPLOYEE_GUID, 'hex'),
        employee_number: 'EMP-362',
        assignment_id: 460,
        assignment_guid: Buffer.from(ASSIGNMENT_GUID, 'hex'),
        transfer_id: 101,
        transfer_guid: Buffer.from(TRANSFER_GUID, 'hex')
      }
    };
  });

  await withMockConnection(connection, async () => {
    const out = await transferToHrViaPackage({
      offer_guid: OFFER_GUID,
      actor: 'hr.user',
      probation_days: 90,
      hr_contact_id: 'HR_TEAM_001',
      transfer_notes: 'Please prioritize onboarding.',
      send_notification: true,
      trigger_onboarding: false
    });
    assert.equal(out.employee_guid, EMPLOYEE_GUID);
    assert.equal(out.assignment_guid, ASSIGNMENT_GUID);
    assert.equal(out.transfer_guid, TRANSFER_GUID);
    assert.equal(Buffer.isBuffer(out.transfer_guid), false);
    assert.equal(calls.commit, 1);
    assert.equal(calls.rollback, 0);
    assert.equal(calls.close, 1);
  });

  assert.equal(booleanToYn(true), 'Y');
  assert.equal(booleanToYn(false), 'N');
});

test('19. transfer history', async () => {
  const rows = await getCandidateTransferHistory(CANDIDATE_GUID, 'hr.user', {
    getContext: async () => CONTEXT,
    listHistory: async (guid) => {
      assert.equal(guid, CANDIDATE_GUID);
      return [
        {
          transfer_id: 101,
          employee_id: 362,
          employee_number: 'EMP-362',
          assignment_id: 460,
          hr_contact_id: 'HR_TEAM_001',
          probation_days: 90,
          send_notification: true,
          notification_status: 'SENT',
          trigger_onboarding: true,
          onboarding_status: 'TRIGGERED',
          transfer_status: 'COMPLETED',
          transferred_by: 'hr.user',
          transfer_date: '2026-09-02 07:00:00'
        }
      ];
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].transfer_id, 101);
  assert.equal(rows[0].employee_number, 'EMP-362');
  assert.equal(rows[0].notification_status, 'SENT');
});

test('package SQL uses TRANSFER_TO_HR binds and does not insert tables from Node', () => {
  assert.match(TRANSFER_PLSQL, /HEXTORAW\(:offer_guid\)/);
  assert.match(TRANSFER_PLSQL, /p_send_notification_flag\s+=>\s+:send_notification_flag/);
  assert.match(TRANSFER_PLSQL, /o_transfer_guid\s+=>\s+:transfer_guid/);
  assert.doesNotMatch(TRANSFER_PLSQL, /INSERT INTO EMPL\.EMPLOYEES/);
  assert.doesNotMatch(TRANSFER_PLSQL, /INSERT INTO REC\.CANDIDATE_HR_TRANSFERS/);
  assert.match(UPDATE_TRANSFER_ACTION_PLSQL, /p_notification_status\s+=>\s+:notification_status/);
  assert.match(TRANSFER_HISTORY_SQL, /REC\.CANDIDATE_HR_TRANSFERS/);
});

test('unexpected Oracle errors map to TRANSFER_FAILED without stacks', () => {
  const err = mapTransferOracleError({
    errorNum: 942,
    message: 'ORA-00942: table or view does not exist'
  });
  assert.equal(err.statusCode, 500);
  assert.equal(err.code, ERROR_CODES.TRANSFER_FAILED);
  assert.equal(err.message, GENERIC_TRANSFER_ERROR_MESSAGE);
});

test('HR contacts are empty unless REC_HR_CONTACTS is configured', () => {
  const previous = process.env.REC_HR_CONTACTS;
  delete process.env.REC_HR_CONTACTS;
  assert.deepEqual(listConfiguredHrContacts(), []);
  process.env.REC_HR_CONTACTS = JSON.stringify([
    { id: 'HR_TEAM_001', name: 'HR Team', email: 'hr@example.com' }
  ]);
  assert.deepEqual(listConfiguredHrContacts(), [
    { hr_contact_id: 'HR_TEAM_001', name: 'HR Team', email: 'hr@example.com' }
  ]);
  assert.equal(resolveHrContactEmail('HR_TEAM_001'), 'hr@example.com');
  assert.equal(resolveHrContactEmail('hr.direct@example.com'), 'hr.direct@example.com');
  if (previous === undefined) delete process.env.REC_HR_CONTACTS;
  else process.env.REC_HR_CONTACTS = previous;
});

test('status update commits separately from transfer', async () => {
  const { calls, connection } = trackingConnection(async () => ({ outBinds: {} }));
  await withMockConnection(connection, async () => {
    await updateTransferActionStatusViaPackage({
      transfer_id: 101,
      actor: 'hr.user',
      notification_status: 'FAILED',
      notification_message: 'SMTP timeout'
    });
    assert.equal(calls.commit, 1);
    assert.equal(calls.rollback, 0);
    assert.equal(calls.close, 1);
  });
});

test('transferSuccessMessage prefers notification failure copy', () => {
  assert.equal(
    transferSuccessMessage({
      send_notification: true,
      trigger_onboarding: true,
      notification_status: 'FAILED',
      onboarding_status: 'TRIGGERED'
    }),
    TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE
  );
});
