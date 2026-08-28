/**
 * Unit tests for candidate demographic field validation, binds, and view mapping.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isFutureDateOnly,
  isValidCalendarDateOnly,
  parseCalendarDateOnlyBind
} from '../../../../utils/dateOnlyUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildCandidateDemographicInBinds } from '../utils/recCandidateDemographicBinds.js';
import { validateCandidateBody } from '../utils/recCandidateValidators.js';
import {
  parseDobDateBind,
  validateCandidateDemographicFieldsInErrors
} from '../utils/recCandidateProfileValidation.js';
import { mapCandidateViewRow } from '../utils/recCandidateViewMapper.js';

describe('dateOnlyUtils', () => {
  it('accepts valid YYYY-MM-DD', () => {
    assert.equal(isValidCalendarDateOnly('1990-05-15'), true);
  });

  it('rejects invalid calendar dates', () => {
    assert.equal(isValidCalendarDateOnly('2024-02-30'), false);
    assert.equal(isValidCalendarDateOnly('1990-13-01'), false);
  });

  it('rejects non YYYY-MM-DD formats', () => {
    assert.equal(isValidCalendarDateOnly('15-05-1990'), false);
    assert.equal(isValidCalendarDateOnly('1990/05/15'), false);
  });

  it('rejects future dates when checked', () => {
    assert.equal(isFutureDateOnly('2099-01-01'), true);
  });

  it('parses YYYY-MM-DD as local calendar Date', () => {
    const d = parseCalendarDateOnlyBind('1990-05-15');
    assert.ok(d instanceof Date);
    assert.equal(d.getFullYear(), 1990);
    assert.equal(d.getMonth(), 4);
    assert.equal(d.getDate(), 15);
  });

  it('parseDobDateBind remains an alias', () => {
    assert.equal(parseDobDateBind('1990-05-15')?.getDate(), 15);
  });
});

describe('buildCandidateDemographicInBinds', () => {
  it('uses normalized body values for Oracle binds', () => {
    const binds = buildCandidateDemographicInBinds({
      dob: '1990-05-15',
      gender: 'MALE',
      nationality: 'Pakistani',
      visa_status: 'TRANSFERABLE',
      alternate_phone: '+96551111111',
      alternate_email: 'candidate.alt@example.com',
      preferred_location: 'Kuwait City',
      source_from: 'LinkedIn Campaign'
    });

    assert.equal(binds.p_gender.val, 'MALE');
    assert.equal(binds.p_alternate_email.val, 'candidate.alt@example.com');
    assert.ok(binds.p_date_of_birth.val instanceof Date);
    assert.equal(binds.p_nationality.val, 'Pakistani');
  });

  it('binds null for omitted demographic fields', () => {
    const binds = buildCandidateDemographicInBinds({});
    assert.equal(binds.p_date_of_birth.val, null);
    assert.equal(binds.p_gender.val, null);
    assert.equal(binds.p_alternate_email.val, null);
  });
});

describe('validateCandidateDemographicFieldsInErrors', () => {
  it('normalizes gender and alternate_email', () => {
    const errors = [];
    const body = {
      gender: 'male',
      alternate_email: 'Candidate.Alt@Example.com'
    };
    validateCandidateDemographicFieldsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.equal(body.gender, 'MALE');
    assert.equal(body.alternate_email, 'candidate.alt@example.com');
  });

  it('trims alternate_phone and preserves +', () => {
    const errors = [];
    const body = { alternate_phone: '  +96551111111  ' };
    validateCandidateDemographicFieldsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.equal(body.alternate_phone, '+96551111111');
  });

  it('rejects future dob', () => {
    const errors = [];
    validateCandidateDemographicFieldsInErrors(errors, { dob: '2099-12-31' });
    assert.ok(errors.some((e) => e.includes('future')));
  });

  it('rejects invalid alternate_email', () => {
    const errors = [];
    validateCandidateDemographicFieldsInErrors(errors, { alternate_email: 'not-an-email' });
    assert.ok(errors.some((e) => e.includes('alternate_email')));
  });

  it('allows omitting all demographic fields', () => {
    const errors = [];
    validateCandidateDemographicFieldsInErrors(errors, {});
    assert.deepEqual(errors, []);
  });

  it('normalizes blank optional strings to null', () => {
    const errors = [];
    const body = {
      dob: '  ',
      gender: '',
      nationality: '  ',
      alternate_email: ''
    };
    validateCandidateDemographicFieldsInErrors(errors, body);
    assert.deepEqual(errors, []);
    assert.equal(body.dob, null);
    assert.equal(body.gender, null);
    assert.equal(body.nationality, null);
    assert.equal(body.alternate_email, null);
  });
});

describe('validateCandidateBody with demographic fields', () => {
  it('accepts create body with all new fields', () => {
    assert.doesNotThrow(() =>
      validateCandidateBody({
        enterprise_id: 1,
        dob: '1990-05-15',
        gender: 'male',
        nationality: 'Pakistani',
        visa_status: 'TRANSFERABLE',
        alternate_phone: '+96551111111',
        alternate_email: 'Candidate.Alt@Example.com',
        preferred_location: 'Kuwait City',
        source: 'CAREER_PORTAL',
        source_from: 'LinkedIn Campaign'
      })
    );
  });

  it('accepts create body without demographic fields', () => {
    assert.doesNotThrow(() => validateCandidateBody({ enterprise_id: 1 }));
  });

  it('rejects invalid future dob', () => {
    assert.throws(
      () => validateCandidateBody({ enterprise_id: 1, dob: '2099-01-01' }),
      (err) => err instanceof ValidationError
    );
  });
});

describe('mapCandidateViewRow demographic mapping', () => {
  it('maps DATE_OF_BIRTH to dob as YYYY-MM-DD', async () => {
    const mapped = await mapCandidateViewRow({
      CANDIDATE_GUID: Buffer.from('50FDBB885E1D190DE0633519000A3BAC', 'hex'),
      DATE_OF_BIRTH: new Date(1990, 4, 15),
      GENDER: 'MALE',
      NATIONALITY: 'Pakistani',
      VISA_STATUS: 'TRANSFERABLE',
      ALTERNATE_PHONE: '+96551111111',
      ALTERNATE_EMAIL: 'candidate.alt@example.com',
      PREFERRED_LOCATION: 'Kuwait City',
      SOURCE_FROM: 'LinkedIn Campaign',
      SOURCE: 'CAREER_PORTAL',
      CURRENT_LOCATION: 'Kuwait'
    });

    assert.equal(mapped.dob, '1990-05-15');
    assert.equal(mapped.date_of_birth, undefined);
    assert.equal(mapped.gender, 'MALE');
    assert.equal(mapped.nationality, 'Pakistani');
    assert.equal(mapped.visa_status, 'TRANSFERABLE');
    assert.equal(mapped.alternate_phone, '+96551111111');
    assert.equal(mapped.alternate_email, 'candidate.alt@example.com');
    assert.equal(mapped.preferred_location, 'Kuwait City');
    assert.equal(mapped.source_from, 'LinkedIn Campaign');
    assert.equal(mapped.source, 'CAREER_PORTAL');
    assert.equal(mapped.current_location, 'Kuwait');
  });
});
