import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import { throwAddAsApplicantPackageError } from '../service/recCandidateMatchService.js';
import {
  ADD_AS_APPLICANT_ERROR_MESSAGE,
  ADD_AS_APPLICANT_CANDIDATE_NOT_FOUND_MESSAGE,
  ADD_AS_APPLICANT_REQUISITION_NOT_FOUND_MESSAGE,
  ALREADY_APPLIED_CONFLICT_MESSAGE,
  ALREADY_APPLIED_MESSAGE,
  NO_ACTIVE_POSTING_MESSAGE,
  REQUISITION_NOT_APPROVED_MESSAGE,
  REQUISITION_NOT_OPEN_MESSAGE
} from '../utils/recCandidateMatchConstants.js';
import { validateAddAsApplicantRequest } from '../utils/recCandidateMatchValidators.js';

const REQ = '574176DB57C7EFCBE0631718000A61BB';
const CAND = '53F8CDD520DAD58AE0631718000ADEDC';

test('validateAddAsApplicantRequest requires enterprise_id and candidate_guid', () => {
  assert.throws(
    () => validateAddAsApplicantRequest(REQ, {}, 1),
    (err) => Array.isArray(err.errors) && err.errors.includes('enterprise_id is required')
  );
  assert.throws(
    () => validateAddAsApplicantRequest(REQ, { candidate_guid: CAND }, 1),
    (err) => Array.isArray(err.errors) && err.errors.includes('enterprise_id is required')
  );
  assert.throws(
    () => validateAddAsApplicantRequest(REQ, { enterprise_id: 1 }, 1),
    (err) => Array.isArray(err.errors) && err.errors.includes('candidate_guid is required')
  );
});

test('validateAddAsApplicantRequest rejects invalid GUIDs and non-numeric enterprise_id', () => {
  assert.throws(
    () => validateAddAsApplicantRequest(REQ, { enterprise_id: 'x', candidate_guid: CAND }, null),
    ValidationError
  );
  assert.throws(
    () =>
      validateAddAsApplicantRequest(REQ, { enterprise_id: 1, candidate_guid: 'not-a-guid' }, 1),
    ValidationError
  );
  assert.throws(
    () =>
      validateAddAsApplicantRequest(
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
        { enterprise_id: 1, candidate_guid: CAND },
        1
      ),
    ValidationError
  );
});

test('validateAddAsApplicantRequest returns normalized hex GUIDs', () => {
  const ctx = validateAddAsApplicantRequest(
    REQ.toLowerCase(),
    { enterprise_id: 12, candidate_guid: CAND.toLowerCase() },
    12
  );
  assert.equal(ctx.enterprise_id, 12);
  assert.equal(ctx.requisition_guid, REQ);
  assert.equal(ctx.candidate_guid, CAND);
});

test('throwAddAsApplicantPackageError maps known package messages', () => {
  assert.throws(
    () => throwAddAsApplicantPackageError(ALREADY_APPLIED_MESSAGE, { candidate_guid: CAND }),
    (err) =>
      err instanceof ConflictError &&
      err.message === ALREADY_APPLIED_CONFLICT_MESSAGE &&
      err.details?.candidate_guid === CAND
  );
  assert.throws(
    () => throwAddAsApplicantPackageError(ADD_AS_APPLICANT_REQUISITION_NOT_FOUND_MESSAGE),
    NotFoundError
  );
  assert.throws(
    () => throwAddAsApplicantPackageError(ADD_AS_APPLICANT_CANDIDATE_NOT_FOUND_MESSAGE),
    NotFoundError
  );
  assert.throws(
    () => throwAddAsApplicantPackageError(REQUISITION_NOT_APPROVED_MESSAGE),
    ValidationError
  );
  assert.throws(() => throwAddAsApplicantPackageError(REQUISITION_NOT_OPEN_MESSAGE), ValidationError);
  assert.throws(() => throwAddAsApplicantPackageError(NO_ACTIVE_POSTING_MESSAGE), ValidationError);
});

test('throwAddAsApplicantPackageError hides unknown Oracle messages', () => {
  assert.throws(
    () => throwAddAsApplicantPackageError('ORA-00942: table or view does not exist'),
    (err) =>
      err instanceof AppError &&
      err.statusCode === 500 &&
      err.message === ADD_AS_APPLICANT_ERROR_MESSAGE
  );
});
